; Optional bundled OpenCode Dev (custom / requirements workbench) after Skills is installed.
; Requires src-tauri/resources/opencode/opencode-desktop-win-x64.exe at package time
; (built from opencode/ via scripts/build-opencode-desktop.ps1).

!macro NSIS_HOOK_POSTINSTALL
  ; Resource files land under $INSTDIR\opencode\ when mapped in tauri.conf.json
  StrCpy $0 "$INSTDIR\opencode\opencode-desktop-win-x64.exe"
  IfFileExists "$0" 0 skip_opencode_bundle
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时安装捆绑的 OpenCode Dev（需求工作台）？$\r$\n$\r$\n(可稍后在 Skills 设置中安装)" \
    IDYES install_opencode IDNO skip_opencode_bundle
  install_opencode:
    DetailPrint "Launching bundled OpenCode Dev installer..."
    ExecWait '"$0"' $1
    DetailPrint "OpenCode Dev installer exit code: $1"
  skip_opencode_bundle:
!macroend

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend