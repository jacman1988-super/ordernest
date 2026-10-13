param([switch]$WithAI)
$ErrorActionPreference = 'Stop'
$previousClient = $env:PAYPAL_SANDBOX_CLIENT_ID
$previousSecret = $env:PAYPAL_SANDBOX_CLIENT_SECRET
$clientPointer = [IntPtr]::Zero
$secretPointer = [IntPtr]::Zero
try {
  Write-Host 'OrderNest uses PayPal Sandbox test data only. Credentials are kept in this process, not saved to a file.'
  $sandboxClient = Read-Host 'Sandbox Client ID' -AsSecureString
  $sandboxSecret = Read-Host 'Sandbox Secret' -AsSecureString
  $clientPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sandboxClient)
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sandboxSecret)
  $env:PAYPAL_SANDBOX_CLIENT_ID = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($clientPointer)
  $env:PAYPAL_SANDBOX_CLIENT_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  if (-not $env:PAYPAL_SANDBOX_CLIENT_ID -or -not $env:PAYPAL_SANDBOX_CLIENT_SECRET) { throw 'Both Sandbox credentials are required.' }
  & (Join-Path $PSScriptRoot 'Start-OrderNest.ps1') -WithAI:$WithAI
} finally {
  $env:PAYPAL_SANDBOX_CLIENT_ID = $previousClient
  $env:PAYPAL_SANDBOX_CLIENT_SECRET = $previousSecret
  if ($clientPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($clientPointer) }
  if ($secretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
  if ($sandboxClient) { $sandboxClient.Dispose() }
  if ($sandboxSecret) { $sandboxSecret.Dispose() }
}
# No credential file, persistence, policy change, account creation or provider
# request is performed by this launcher itself. Provider reads require an
# explicit Sandbox selection and review in the application.
