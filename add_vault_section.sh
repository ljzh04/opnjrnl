#!/bin/bash
sed -i '/{\/\* Cloud Storage Backups Disclosure & Privacy Footer \*\/}/i\
              {/* Native Vault Directory Settings */}\
              <div className="flex flex-col gap-3 mt-4">\
                <div className="flex items-center gap-2 mb-1 px-1">\
                  <Folder className="w-3.5 h-3.5 opacity-60" />\
                  <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">Local Vault</span>\
                </div>\
                <div \
                  className="rounded-xl border overflow-hidden flex flex-col"\
                  style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}\
                >\
                  <div className="p-4 flex flex-col gap-2 border-b" style={{ borderColor: theme.surfaceBorder }}>\
                    <span className="text-[11px] opacity-70 leading-relaxed">\
                      Store your journal directly on your device. This allows you to sync with your own services (like Syncthing or Dropbox) and prevents vendor lock-in.\
                    </span>\
                    <div className="flex items-center justify-between mt-2">\
                      <div className="flex flex-col">\
                        <span className="text-xs font-semibold">{vaultName ? `Connected: ${vaultName}` : "Not Connected"}</span>\
                      </div>\
                      {vaultName ? (\
                        <button \
                          onClick={onDisconnectVault}\
                          className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-500 active:scale-95 transition-transform"\
                        >\
                          Disconnect\
                        </button>\
                      ) : (\
                        <button \
                          onClick={onSelectVault}\
                          className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full active:scale-95 transition-transform border"\
                          style={{ backgroundColor: theme.accent, color: theme.background, borderColor: theme.surfaceBorder }}\
                        >\
                          Select Folder\
                        </button>\
                      )}\
                    </div>\
                  </div>\
                </div>\
              </div>\
' src/components/Sidebar.tsx
