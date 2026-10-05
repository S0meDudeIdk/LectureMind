# Build separately to migrate the existing AI Studio archive-based service.
[CmdletBinding()]
param(
    [string]$BuildVariables = '',
    [Parameter(Mandatory)][string]$RuntimeVariables,
    [string]$Project = 'ai-riser-506205',
    [string]$Region = 'asia-southeast1',
    [string]$Service = 'lecturemind',
    [string]$ExistingImage = ''
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Assert-Command([string]$Action) {
    if ($LASTEXITCODE -ne 0) { throw "$Action failed. Stop and inspect the command error." }
}

# Only public frontend values and build controls may enter the build configuration.
$BuildEntries = $BuildVariables -split ','
if (-not $ExistingImage) {
foreach ($Entry in $BuildEntries) {
    if ($Entry -notmatch '^(VITE_[A-Z_]+|GOOGLE_NODE_RUN_SCRIPTS|GOOGLE_PACKAGE_MANAGER)=') {
        throw 'Unexpected build variable. Do not put backend credentials in build variables.'
    }
    if ($Entry -match '^VITE_APP_CHECK_DEBUG_TOKEN=') { throw 'Do not deploy App Check debug tokens.' }
}
foreach ($Required in @('VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_RECAPTCHA_SITE_KEY')) {
    if (-not ($BuildEntries | Where-Object { $_ -match "^$Required=.+$" })) { throw "Missing build value: $Required" }
}
}

New-Item -ItemType Directory -Path '.tmp' -Force | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupFile = Join-Path (Get-Location) ".tmp/cloud-run-before-$Stamp.json"
$ServiceJson = (& gcloud run services describe $Service --region=$Region --project=$Project --format=json) -join "`n"
Assert-Command 'Reading current service'
[IO.File]::WriteAllText($BackupFile, $ServiceJson)
$Current = $ServiceJson | ConvertFrom-Json -AsHashtable
if ($Current.spec.template.spec.containers.Count -ne 1) { throw 'Expected one container; review a multi-container service separately.' }

$Repository = 'cloud-run-source-deploy'
if ($ExistingImage) {
    $ExpectedPrefix = "$Region-docker.pkg.dev/$Project/$Repository/${Service}"
    if (-not ($ExistingImage.StartsWith("${ExpectedPrefix}:") -or $ExistingImage.StartsWith("${ExpectedPrefix}@sha256:"))) {
        throw 'Existing image must belong to this service repository.'
    }
    $Image = $ExistingImage
    $ImageInfo = (& gcloud artifacts docker images describe $Image --project=$Project --format=json) -join "`n"
    Assert-Command 'Checking previously built image'
    $Digest = ($ImageInfo | ConvertFrom-Json).image_summary.digest
    if ($Digest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Could not verify image digest.' }
    $Image = "${ExpectedPrefix}@$Digest"
    Write-Host 'Reusing the published image; no build will run.'
} else {
$Repositories = (& gcloud artifacts repositories list --location=$Region --project=$Project --format=json) -join "`n"
Assert-Command 'Reading repositories'
$Existing = @($Repositories | ConvertFrom-Json | Where-Object { $_.name -eq "projects/$Project/locations/$Region/repositories/$Repository" })
if ($Existing.Count -eq 0) {
    & gcloud artifacts repositories create $Repository --repository-format=docker --location=$Region --project=$Project
    Assert-Command 'Creating container repository'
}
$Image = "$Region-docker.pkg.dev/$Project/$Repository/${Service}:$Stamp"
# Publish directly: exporting large base layers through Cloud Build's Docker
# daemon failed with docker.sock EOF after an otherwise successful build.
$PackArgs = @('build', $Image, '--builder', 'gcr.io/buildpacks/builder:latest', '--network', 'cloudbuild', '--publish')
foreach ($Entry in $BuildEntries) { $PackArgs += @('--env', $Entry) }
$BuildConfig = @{
    steps = @(@{ name = 'gcr.io/k8s-skaffold/pack'; entrypoint = 'pack'; args = $PackArgs })
    timeout = '1200s'
}
$BuildFile = Join-Path (Get-Location) ".tmp/cloud-build-$Stamp.json"
[IO.File]::WriteAllText($BuildFile, ($BuildConfig | ConvertTo-Json -Depth 20))
& gcloud builds submit . --config=$BuildFile --region=$Region --project=$Project
Assert-Command 'Building container image'
}

# Re-read after the build so a concurrent update is not silently overwritten.
$LatestJson = (& gcloud run services describe $Service --region=$Region --project=$Project --format=json) -join "`n"
Assert-Command 'Rechecking service'
$Latest = $LatestJson | ConvertFrom-Json -AsHashtable
if ($Latest.metadata.resourceVersion -ne $Current.metadata.resourceVersion) { throw "Service changed during the build. Image is ready at $Image; inspect the new service before deploying." }
$Template = $Current.spec.template
$Template.spec.Remove('runtimeClassName') | Out-Null
$Template.metadata.Remove('name') | Out-Null
foreach ($Key in @('run.googleapis.com/sources', 'run.googleapis.com/base-images')) {
    $Template.metadata.annotations.Remove($Key) | Out-Null
}
$Container = $Template.spec.containers[0]
$Container.image = $Image
$Container.Remove('command') | Out-Null
$Container.Remove('args') | Out-Null
$Container.resources.limits.memory = '1Gi'
$Template.spec.serviceAccountName = "lecturemind-runtime@$Project.iam.gserviceaccount.com"
$Template.spec.timeoutSeconds = 900
$Removed = @('GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS_JSON', 'GCP_SERVICE_ACCOUNT_KEY', 'QUOTA_HASH_SECRET')
$RuntimeEntries = $RuntimeVariables -split ','
$RuntimeNames = @($RuntimeEntries | ForEach-Object { ($_ -split '=', 2)[0] })
$Environment = @($Container.env | Where-Object { $_.name -notin ($Removed + $RuntimeNames) })
foreach ($Entry in $RuntimeEntries) {
    $Parts = $Entry -split '=', 2
    if ($Parts.Count -ne 2) { throw 'Malformed runtime variable.' }
    $Environment += @{ name = $Parts[0]; value = $Parts[1] }
}
$Environment += @{ name = 'QUOTA_HASH_SECRET'; valueFrom = @{ secretKeyRef = @{ name = 'lecturemind-quota-hash'; key = 'latest' } } }
$Container.env = $Environment
$Metadata = @{ name = $Service; namespace = $Project; resourceVersion = $Current.metadata.resourceVersion }
foreach ($Key in @('labels', 'annotations')) { if ($Current.metadata.ContainsKey($Key)) { $Metadata[$Key] = $Current.metadata[$Key] } }
$Manifest = @{ apiVersion = 'serving.knative.dev/v1'; kind = 'Service'; metadata = $Metadata; spec = $Current.spec }
$ManifestFile = Join-Path (Get-Location) ".tmp/cloud-run-image-$Stamp.json"
[IO.File]::WriteAllText($ManifestFile, ($Manifest | ConvertTo-Json -Depth 50))
& gcloud run services replace $ManifestFile --dry-run --region=$Region --project=$Project
Assert-Command 'Validating replacement service'
& gcloud run services replace $ManifestFile --region=$Region --project=$Project
Assert-Command 'Deploying replacement service'
Write-Host "Deployment complete. Original service configuration: $BackupFile"
Write-Host 'Keep .tmp private: the service backup can contain existing environment values.'
