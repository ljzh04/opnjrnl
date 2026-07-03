#!/bin/bash
sed -i '/<Sidebar/a\
          vaultName={dirHandle ? dirHandle.name : null}\
          onSelectVault={async () => {\
            const handle = await promptDirectorySelection();\
            if (handle) {\
              setDirHandle(handle);\
              const dirEntries = await loadEntriesFromDirectory(handle);\
              if (dirEntries.length > 0) {\
                setEntries(dirEntries);\
                alert(`Loaded ${dirEntries.length} entries from vault.`);\
              } else {\
                alert(`Vault connected. Found 0 entries.`);\
              }\
            }\
          }}\
          onDisconnectVault={async () => {\
            await disconnectDirectory();\
            setDirHandle(null);\
            alert("Disconnected local vault.");\
          }}' src/App.tsx
