import { getAccessToken } from './auth'
import firebaseConfig from '../../firebase-applet-config.json'

declare global {
  interface Window {
    gapi?: any
    google?: any
  }
}

let pickerApiLoaded = false
let loadPromise: Promise<void> | null = null

async function ensurePickerApi(): Promise<void> {
  if (pickerApiLoaded) return
  if (loadPromise) return loadPromise

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.defer = true
    script.onload = () => {
      window.gapi.load('picker', {
        callback: () => {
          pickerApiLoaded = true
          resolve()
        },
        onerror: () => reject(new Error('Failed to load Picker API')),
      })
    }
    script.onerror = () => reject(new Error('Failed to load Google API script'))
    document.head.appendChild(script)
  })

  return loadPromise
}

function getPicker() {
  return window.google?.picker || window.gapi?.picker
}

export async function openGoogleDrivePicker(
  pickerType: 'image' | 'video'
): Promise<{ fileId: string; name: string } | null> {
  try {
    await ensurePickerApi()

    const token = await getAccessToken()
    if (!token) throw new Error('Not authenticated')

    const picker = getPicker()
    if (!picker) throw new Error('Google Picker API not loaded')

    const viewId = pickerType === 'image'
      ? picker.ViewId.DOCS_IMAGES
      : picker.ViewId.DOCS_VIDEOS

    return new Promise((resolve) => {
      const view = new picker.View(viewId)

      const pickerBuilder = new picker.PickerBuilder()
        .setOAuthToken(token)
        .addView(view)
        .setDeveloperKey(firebaseConfig.apiKey)
        .setAppId(firebaseConfig.messagingSenderId)
        .setCallback((data: any) => {
          if (data.action === picker.Action.PICKED) {
            const doc = data.docs[0]
            resolve({ fileId: doc.id, name: doc.name })
          } else if (data.action === picker.Action.CANCEL) {
            resolve(null)
          }
        })
        .build()

      pickerBuilder.setVisible(true)
    })
  } catch (err) {
    console.error('Google Drive picker error:', err)
    return null
  }
}
