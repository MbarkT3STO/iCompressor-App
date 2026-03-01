!macro customInstall
  WriteRegStr HKCR "*\shell\iCompressor" "" "Compress with iCompressor"
  WriteRegStr HKCR "*\shell\iCompressor\command" "" '"$INSTDIR\iCompressor.exe" "%1"'

  WriteRegStr HKCR "Directory\shell\iCompressor" "" "Compress with iCompressor"
  WriteRegStr HKCR "Directory\shell\iCompressor\command" "" '"$INSTDIR\iCompressor.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCR "*\shell\iCompressor"
  DeleteRegKey HKCR "Directory\shell\iCompressor"
!macroend
