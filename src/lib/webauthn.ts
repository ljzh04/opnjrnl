function bufferToBase64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(base64url: string) {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output.buffer;
}

export async function registerDeviceLock(): Promise<string | null> {
  if (!window.PublicKeyCredential) {
    alert("Web Authentication API is not supported on this device/browser.");
    return null;
  }

  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: "opnjrnl",
        },
        user: {
          id: userId,
          name: "opnjrnl-user",
          displayName: "Journal User",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "none"
      }
    }) as PublicKeyCredential;

    if (credential) {
      return bufferToBase64url(credential.rawId);
    }
    return null;
  } catch (err: any) {
    console.error("WebAuthn creation failed", err);
    alert("Failed to setup device lock: " + err.message);
    return null;
  }
}

export async function verifyDeviceLock(credentialIdStr: string): Promise<boolean> {
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    
    const rawId = base64urlToBuffer(credentialIdStr);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          type: "public-key",
          id: rawId,
        }],
        userVerification: "required",
        timeout: 60000
      }
    });

    return !!assertion;
  } catch (err: any) {
    console.error("WebAuthn verification failed", err);
    alert("Device authentication failed or was cancelled.");
    return false;
  }
}
