param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [string]$JdkPath = '',
    [string]$SdkPath = '',
    [switch]$VerifyReleaseBlocked,
    [switch]$SessionAuth
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not $JdkPath) { $JdkPath = Join-Path $repo '.local/android-toolchain/jdk/jdk-21.0.12.1+1' }
if (-not $SdkPath) { $SdkPath = Join-Path $repo '.local/android-toolchain/sdk' }
$node = (Resolve-Path -LiteralPath $NodePath).Path
$nodeVersion = & $node --version
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22) { throw 'Node 22 or newer is required.' }
$jdk = (Resolve-Path -LiteralPath $JdkPath).Path
$sdk = (Resolve-Path -LiteralPath $SdkPath).Path
if (-not (Test-Path "$sdk/platforms/android-36/android.jar")) { throw 'Android SDK 36 is missing.' }
if (-not (Test-Path "$jdk/bin/javac.exe")) { throw 'A complete JDK is required.' }
# Process-scoped only; restore the caller environment even on failure.
$keys = @('JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'ANDROID_USER_HOME', 'GRADLE_USER_HOME')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
try {
    $env:JAVA_HOME = $jdk
    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk
    $env:ANDROID_USER_HOME = Join-Path $repo '.local/android-toolchain/android-user'
    $env:GRADLE_USER_HOME = Join-Path $repo '.local/android-toolchain/gradle'
    Push-Location $PSScriptRoot
    try {
        if ($SessionAuth) { & $node build-web.mjs --sessions }
        else { & $node build-web.mjs }
        if ($LASTEXITCODE -ne 0) { throw 'Bundled frontend build failed.' }
        & $node node_modules/@capacitor/cli/bin/capacitor sync android
        if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
        $mobileTests = @(Get-ChildItem tests/*.test.mjs | ForEach-Object { $_.FullName })
        & $node --test @mobileTests
        if ($LASTEXITCODE -ne 0) { throw 'Android harness safety checks failed.' }
    } finally { Pop-Location }
    Push-Location (Join-Path $PSScriptRoot 'android')
    try {
        & ./gradlew.bat --no-daemon --console=plain :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
        if ($LASTEXITCODE -ne 0) { throw 'Android debug build or lint failed.' }
        if ($VerifyReleaseBlocked) {
            $tasks = & ./gradlew.bat --no-daemon --console=plain :app:tasks --all 2>&1
            if ($LASTEXITCODE -ne 0) { throw 'Unable to verify the Gradle task graph.' }
            if ($tasks -match '^\s*(assembleRelease|bundleRelease|packageRelease)\b') { throw 'Unexpected release task is enabled.' }
            Write-Output 'Release APK and bundle tasks are absent.'
        }
    } finally { Pop-Location }
} finally {
    foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
Write-Output 'Debug APK: mobile/android/app/build/outputs/apk/debug/app-debug.apk'
Write-Output 'Not installed on a device. Not suitable for Play Store submission.'
