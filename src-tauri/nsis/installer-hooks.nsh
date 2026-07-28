; Optional bundled OpenCode (custom / requirements workbench) after Skills is installed.
; Requires src-tauri/resources/opencode/opencode-desktop-win-x64.exe at package time
; (built from opencode/ via scripts/build-opencode-desktop.ps1).

!macro NSIS_HOOK_POSTINSTALL
  ; Resource files land under $INSTDIR\opencode\ when mapped in tauri.conf.json
  StrCpy $0 "$INSTDIR\opencode\opencode-desktop-win-x64.exe"
  IfFileExists "$0" 0 skip_opencode_bundle
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Install bundled OpenCode (requirements workbench)?$\r$\n$\r$\n(You can also install later in Skills Settings)" \
    IDYES install_opencode IDNO skip_opencode_bundle
  install_opencode:
    DetailPrint "Launching bundled OpenCode installer..."
    ExecWait '"$0"' $1
    DetailPrint "OpenCode installer exit code: $1"
  skip_opencode_bundle:
!macroend

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
