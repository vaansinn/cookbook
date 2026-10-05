param([Parameter(Mandatory = $true)][string]$Serial)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$sdk = Join-Path $repo '.local/android-toolchain/sdk'
$adb = Join-Path $sdk 'platform-tools/adb.exe'
$device = & $adb -s $Serial get-state
if ($LASTEXITCODE -ne 0 -or $device.Trim() -ne 'device') { throw 'The selected device is not connected/authorised.' }
$reverse = & $adb -s $Serial reverse --list
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect existing mappings.' }
if ($reverse -match '\btcp:5100\b') { throw 'Port 5100 already mapped; preserve it and review before this offline/online test.' }
$keys = @('JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','ANDROID_USER_HOME','GRADLE_USER_HOME')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
try {
    $env:JAVA_HOME = Join-Path $repo '.local/android-toolchain/jdk/jdk-21.0.12.1+1'
    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk
    $env:ANDROID_USER_HOME = Join-Path $repo '.local/android-toolchain/android-user'
    $env:GRADLE_USER_HOME = Join-Path $repo '.local/android-toolchain/gradle'
    Push-Location (Join-Path $PSScriptRoot 'android')
    try {
        & ./gradlew.bat --no-daemon --console=plain :app:assembleDebugAndroidTest
        if ($LASTEXITCODE -ne 0) { throw 'Instrumentation build failed.' }
    } finally { Pop-Location }
} finally {
    foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
& $adb -s $Serial install -r (Join-Path $PSScriptRoot 'android/app/build/outputs/apk/debug/app-debug.apk')
if ($LASTEXITCODE -ne 0) { throw 'Bundled app installation failed.' }
& $adb -s $Serial install -r -t (Join-Path $PSScriptRoot 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')
if ($LASTEXITCODE -ne 0) { throw 'Test runner installation failed.' }

function Test-BundledShell([string]$expectApi) {
    $result = & $adb -s $Serial shell am instrument -w -r -e class com.cookbook.localdev.BundledShellInstrumentedTest -e expectApi $expectApi com.cookbook.bundleddev.test/androidx.test.runner.AndroidJUnitRunner
    $result | Write-Output
    if ($LASTEXITCODE -ne 0 -or -not ($result -match 'OK \(1 test\)')) { throw "Device test failed (expectApi=$expectApi)." }
}
# Never read/migrate/clear data from com.cookbook.localdev (the first harness).
# This runner uses only anonymous guest content and writes no account data.
Test-BundledShell 'false'
& $adb -s $Serial reverse tcp:5100 tcp:5100
if ($LASTEXITCODE -ne 0) { throw 'API-only reverse mapping failed.' }
try { Test-BundledShell 'true' }
catch {
    & $adb -s $Serial reverse --remove tcp:5100
    throw
}
& $adb -s $Serial shell am start -n com.cookbook.bundleddev/com.cookbook.localdev.MainActivity
if ($LASTEXITCODE -ne 0) { throw 'Opening the bundled app failed.' }
Write-Output 'Bundled shell passed without API mapping; guest recipes passed after mapping port 5100. API mapping left active for testing.'
