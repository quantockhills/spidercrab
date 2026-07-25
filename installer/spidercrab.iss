; ============================================================================
; Spidercrab — Windows installer (Inno Setup 6)
;
; Produces SpidercrabSetup.exe, which copies the extension + web UI into
; REAPER's UserPlugins folder so users don't have to place files by hand.
;
; Build:  see installer/README.md  (stage payload, then run `iscc spidercrab.iss`)
; ============================================================================

#define AppName "Spidercrab"
; Keep in sync with CHANGELOG.md
#define AppVersion "0.3.0-alpha"
#define AppPublisher "quantockhills"
#define AppURL "https://github.com/quantockhills/spidercrab"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppSupportURL={#AppURL}
; Install straight into REAPER's per-user UserPlugins folder. The user can
; change this on the directory page for a portable REAPER install.
DefaultDirName={userappdata}\REAPER\UserPlugins
DisableProgramGroupPage=yes
DirExistsWarning=no
; No admin: everything lives under the user's AppData.
PrivilegesRequired=lowest
OutputBaseFilename=SpidercrabSetup
OutputDir=output
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
Uninstallable=yes
UninstallDisplayName={#AppName} (REAPER extension)
; Only offer 64-bit (the DLL is x64).
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Messages]
WelcomeLabel2=This will install the {#AppName} REAPER extension and its web interface into REAPER's UserPlugins folder.%n%nClose REAPER first, then start it afterwards from Extensions > Spidercrab.

[Files]
; --- staged payload (see installer/README.md) ---
Source: "payload\reaper_spidercrab.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\frontend\*";            DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs createallsubdirs
; Optional: ship the PDB for crash symbolication (comment out for public releases)
; Source: "payload\reaper_spidercrab.pdb"; DestDir: "{app}"; Flags: ignoreversion

[Code]
// Warn (don't hard-block) if REAPER is open — its running instance locks the DLL.
function InitializeSetup(): Boolean;
begin
  Result := True;
  if FindWindowByClassName('REAPERwnd') <> 0 then
  begin
    if MsgBox('REAPER looks like it is running.'#13#10#13#10 +
              'Please close REAPER before installing, otherwise the plugin file is locked and the copy will fail.'#13#10#13#10 +
              'Continue anyway?', mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
end;
