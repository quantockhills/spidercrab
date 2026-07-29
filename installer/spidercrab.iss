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

// Registers the "spidercrab" device in ReaLearn's OWN OSC device list
// (Helgoboss/ReaLearn/osc.json under the REAPER resource dir) — NOT
// reaper.ini. REAPER has its own separate native OSC control-surface list
// (reaper.ini's csurf_N entries, configured via REAPER's own Preferences),
// which is a completely different system ReaLearn's Input/Output dropdowns
// don't read from at all. ReaLearn maintains its own device list, editable
// only via its "Manage OSC devices" dialog, persisted to this JSON file.
//
// The UUID below is fixed (not randomly generated) on purpose: it has to
// match the id embedded in any ReaLearn "unit" export we ship, or an
// imported unit's controlDeviceId/feedbackDeviceId reference wouldn't
// resolve to this device.
procedure RegisterSpidercrabOscDevice();
var
  OscJsonPath: String;
  RawContent: AnsiString;
  Content: String;
  DeviceObj: String;
  DevicesPos, BracketPos, ScanPos: Integer;
  Ch: Char;
  Rest, Insertion: String;
  IsEmptyArray: Boolean;
begin
  DeviceObj := '{"id":"5fb52133-18ef-489b-b7a9-57152d58db98","name":"spidercrab",' +
    '"localPort":9001,"deviceHost":"127.0.0.1","devicePort":9011}';
  OscJsonPath := ExpandConstant('{userappdata}\REAPER\Helgoboss\ReaLearn\osc.json');

  if not FileExists(OscJsonPath) then
  begin
    ForceDirectories(ExtractFilePath(OscJsonPath));
    SaveStringToFile(OscJsonPath, AnsiString('{"devices":[' + DeviceObj + ']}'), False);
    Log('Created osc.json with the spidercrab OSC device');
    Exit;
  end;

  if not LoadStringFromFile(OscJsonPath, RawContent) then
  begin
    Log('Could not read osc.json — skipping OSC device setup');
    Exit;
  end;
  // Do all actual string work (indexing, Pos, Copy) on a plain String
  // (Inno 6 is Unicode, String = UnicodeString) rather than AnsiString —
  // LoadStringFromFile/SaveStringToFile need AnsiString specifically, but
  // mixing that with per-character indexing/comparisons risks an
  // AnsiChar-vs-Char type mismatch, so convert once right after loading
  // and convert back once right before saving.
  Content := String(RawContent);

  if Pos('"spidercrab"', Content) > 0 then
  begin
    Log('spidercrab OSC device already present in osc.json — leaving as-is');
    Exit;
  end;

  DevicesPos := Pos('"devices"', Content);
  if DevicesPos = 0 then
  begin
    Log('osc.json has no "devices" key — skipping OSC device setup (unexpected format)');
    Exit;
  end;

  BracketPos := 0;
  for ScanPos := DevicesPos to Length(Content) do
  begin
    if Content[ScanPos] = '[' then
    begin
      BracketPos := ScanPos;
      break;
    end;
  end;
  if BracketPos = 0 then
  begin
    Log('osc.json "devices" has no array — skipping OSC device setup');
    Exit;
  end;

  // Peek past the '[' (skipping whitespace) to see if the array is empty —
  // JSON forbids a trailing comma, so an empty array needs different
  // insertion text than a non-empty one.
  IsEmptyArray := False;
  for ScanPos := BracketPos + 1 to Length(Content) do
  begin
    Ch := Content[ScanPos];
    if (Ch = ' ') or (Ch = #9) or (Ch = #13) or (Ch = #10) then
      continue;
    IsEmptyArray := (Ch = ']');
    break;
  end;

  if IsEmptyArray then
    Insertion := DeviceObj
  else
    Insertion := DeviceObj + ',';

  Rest := Copy(Content, BracketPos + 1, Length(Content) - BracketPos);
  Content := Copy(Content, 1, BracketPos) + Insertion + Rest;

  SaveStringToFile(OscJsonPath, AnsiString(Content), False);
  Log('Added spidercrab OSC device to osc.json');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    RegisterSpidercrabOscDevice();
end;
