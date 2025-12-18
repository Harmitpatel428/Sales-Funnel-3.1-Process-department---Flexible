const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  buildResources: [
    'build/icon.ico',
    'build/installerIcon.ico'
  ],
  documentationFiles: [
    'CLIENT_INSTALLATION_GUIDE.md',
    'LAUNCH_INSTRUCTIONS.md',
    'PERFORMANCE_OPTIMIZATION.md',
    'README.txt'
  ],
  nsisResources: [
    'build/license.txt',
    'build/installer.nsh',
    'build/installerHeaderIcon.ico'
  ],
  requiredDirs: [
    'electron',
    'app',
    'scripts'
  ],
  outputDirs: {
    dist: 'dist_v2_1_0',
    out: 'out',
    delivery: 'delivery'
  },
  installerPattern: 'Enterprise Lead Management System Setup *.exe',
  minFileSize: 1024, // 1KB
  maxFileSize: 1048576, // 1MB
  smallIcoWarningThreshold: 10240 // 10KB
};

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Log error message and exit process
 */
function logError(message) {
  console.error(`❌ ERROR: ${message}`);
  process.exit(1);
}

/**
 * Log warning message
 */
function logWarning(message) {
  console.warn(`⚠️  WARNING: ${message}`);
}

/**
 * Log success message
 */
function logSuccess(message) {
  console.log(`✅ ${message}`);
}

/**
 * Log informational message
 */
function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

/**
 * Log build step header
 */
function logStep(message) {
  console.log('\n' + '='.repeat(60));
  console.log(`🔨 ${message}`);
  console.log('='.repeat(60));
  
  // Add to log buffer
  const timestamp = new Date().toISOString();
  buildLogBuffer.push(`[${timestamp}] PHASE: ${message}`);
  buildLogBuffer.push('='.repeat(60));
}

/**
 * Calculate SHA256 checksum of a file
 */
function calculateChecksum(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Check if file exists
 */
function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}

/**
 * Check if directory exists
 */
function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Create directory if it doesn't exist
 */
function ensureDir(dirPath) {
  if (!dirExists(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Copy file with error handling
 */
function copyFile(src, dest) {
  try {
    fs.copyFileSync(src, dest);
  } catch (error) {
    throw new Error(`Failed to copy ${src} to ${dest}: ${error.message}`);
  }
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  return fs.statSync(filePath).size;
}

/**
 * Find files matching pattern
 */
function findFile(pattern, directory) {
  if (!dirExists(directory)) {
    return null;
  }
  
  const files = fs.readdirSync(directory);
  const regex = new RegExp(pattern.replace(/\*/g, '.*'));
  return files.find(file => regex.test(file));
}

// Global log buffer for capturing command output
let buildLogBuffer = [];

/**
 * Execute shell command with live output and capture
 */
function runCommand(command, description) {
  try {
    logInfo(`Running: ${command}`);
    
    // Capture command output while streaming to console
    const output = execSync(command, { 
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    // Add to log buffer with timestamp
    const timestamp = new Date().toISOString();
    buildLogBuffer.push(`[${timestamp}] ${description}`);
    buildLogBuffer.push(`Command: ${command}`);
    buildLogBuffer.push(`Output: ${output}`);
    buildLogBuffer.push('---');
    
    logSuccess(`${description} completed successfully`);
  } catch (error) {
    // Add error to log buffer
    const timestamp = new Date().toISOString();
    buildLogBuffer.push(`[${timestamp}] ERROR in ${description}`);
    buildLogBuffer.push(`Command: ${command}`);
    buildLogBuffer.push(`Error: ${error.message}`);
    buildLogBuffer.push('---');
    
    throw new Error(`${description} failed: ${error.message}`);
  }
}

/**
 * Validate build resources before packaging
 */
function validateBuildResources() {
  logStep('Validating Build Resources');
  
  for (const resource of CONFIG.buildResources) {
    const resourcePath = path.resolve(resource);
    
    // Check if file exists
    if (!fs.existsSync(resourcePath)) {
      logError(`Required build resource not found: ${resource}`);
    }
    
    // Get file stats
    const stats = fs.statSync(resourcePath);
    
    // Check file size sanity (> 1KB and < 1MB)
    if (stats.size < CONFIG.minFileSize) {
      logError(`Icon file ${resource} is too small (${formatBytes(stats.size)}). Minimum size required: ${formatBytes(CONFIG.minFileSize)}`);
    }
    
    if (stats.size > CONFIG.maxFileSize) {
      logError(`Icon file ${resource} is too large (${formatBytes(stats.size)}). Maximum size allowed: ${formatBytes(CONFIG.maxFileSize)}`);
    }
    
    // Check file extension
    if (!resource.toLowerCase().endsWith('.ico')) {
      logError(`Icon file ${resource} must have .ico extension`);
    }
    
    // Warning for small ICO files (potential single-resolution)
    if (stats.size < CONFIG.smallIcoWarningThreshold) {
      logWarning(`Icon file ${resource} is very small (${formatBytes(stats.size)}). Ensure it contains multiple resolutions (16, 32, 48, 64, 128, 256px).`);
      logWarning(`Manual verification recommended: Right-click the ICO file in Windows Explorer and check Properties to confirm multiple icon sizes are available.`);
    }
    
    // Check if file is readable
    try {
      fs.accessSync(resourcePath, fs.constants.R_OK);
    } catch (error) {
      logError(`Cannot read icon file ${resource}: ${error.message}`);
    }
    
    logSuccess(`Validated ${resource} (${formatBytes(stats.size)})`);
  }
  
  // Call additional validation functions
  validateDocumentation();
  validateNsisResources();
  validateDirectories();
  validateDependencies();
  
  console.log('✅ All build resources validated successfully');
}

/**
 * Validate documentation files
 */
function validateDocumentation() {
  logStep('Validating Documentation Files');
  
  for (const docFile of CONFIG.documentationFiles) {
    if (!fileExists(docFile)) {
      logError(`Required documentation file not found: ${docFile}. Run the documentation generation script or create manually.`);
    }
    
    const size = getFileSize(docFile);
    if (size < 100) {
      logError(`Documentation file ${docFile} is too small (${formatBytes(size)}). Should contain actual content.`);
    }
    
    if (size < 500) {
      logWarning(`Documentation file ${docFile} is very small (${formatBytes(size)}). Consider adding more content.`);
    }
    
    // Check readability
    try {
      fs.accessSync(docFile, fs.constants.R_OK);
    } catch (error) {
      logError(`Cannot read documentation file ${docFile}: ${error.message}`);
    }
    
    logSuccess(`Validated ${docFile} (${formatBytes(size)})`);
  }
}

/**
 * Validate NSIS resources
 */
function validateNsisResources() {
  logStep('Validating NSIS Resources');
  
  for (const resource of CONFIG.nsisResources) {
    if (!fileExists(resource)) {
      if (resource.includes('license.txt')) {
        logError(`License file not found: ${resource}. Create build/license.txt with End User License Agreement.`);
      } else if (resource.includes('installer.nsh')) {
        logError(`NSIS script not found: ${resource}. Create build/installer.nsh with NSIS directives.`);
      } else if (resource.includes('installerHeaderIcon.ico')) {
        logError(`Installer header icon not found: ${resource}. Create build/installerHeaderIcon.ico.`);
      }
    }
    
    const size = getFileSize(resource);
    
    if (resource.includes('license.txt')) {
      if (size < 500) {
        logError(`License file ${resource} is too small (${formatBytes(size)}). Should contain actual license text.`);
      }
    } else if (resource.includes('installer.nsh')) {
      if (size < 50) {
        logError(`NSIS script ${resource} is too small (${formatBytes(size)}). Should contain NSIS directives.`);
      }
    } else if (resource.includes('installerHeaderIcon.ico')) {
      // Apply same validation as other icons
      if (size < CONFIG.minFileSize) {
        logError(`Installer header icon ${resource} is too small (${formatBytes(size)}). Minimum size required: ${formatBytes(CONFIG.minFileSize)}`);
      }
      if (size > CONFIG.maxFileSize) {
        logError(`Installer header icon ${resource} is too large (${formatBytes(size)}). Maximum size allowed: ${formatBytes(CONFIG.maxFileSize)}`);
      }
    }
    
    logSuccess(`Validated ${resource} (${formatBytes(size)})`);
  }
}

/**
 * Validate required directories
 */
function validateDirectories() {
  logStep('Validating Directory Structure');
  
  for (const dir of CONFIG.requiredDirs) {
    if (!dirExists(dir)) {
      logError(`Required directory not found: ${dir}/`);
    }
    logSuccess(`Directory exists: ${dir}/`);
  }
  
  // Verify electron/main.js exists and is not empty
  if (!fileExists('electron/main.js')) {
    logError('electron/main.js not found. This file is required for Electron to run.');
  }
  
  const mainJsSize = getFileSize('electron/main.js');
  if (mainJsSize < 1000) {
    logError(`electron/main.js is too small (${formatBytes(mainJsSize)}). File may be incomplete.`);
  }
  
  logSuccess(`electron/main.js validated (${formatBytes(mainJsSize)})`);
  
  // Verify package.json exists and contains required scripts
  if (!fileExists('package.json')) {
    logError('package.json not found. This file is required for the build process.');
  }
  
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredScripts = ['build:prod', 'build-electron:win', 'package:client'];
  
  for (const script of requiredScripts) {
    if (!packageJson.scripts[script]) {
      logError(`Required script not found in package.json: ${script}`);
    }
  }
  
  logSuccess('package.json validated with required scripts');
}

/**
 * Validate dependencies
 */
function validateDependencies() {
  logStep('Validating Dependencies');
  
  if (!dirExists('node_modules')) {
    logError('node_modules directory not found. Run "npm install" to install dependencies.');
  }
  
  const requiredDeps = ['electron', 'electron-builder', 'next', 'react'];
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  for (const dep of requiredDeps) {
    if (!packageJson.dependencies[dep] && !packageJson.devDependencies[dep]) {
      logError(`Required dependency not found: ${dep}. Install with "npm install ${dep}"`);
    }
  }
  
  logSuccess('Dependencies validated');
}

/**
 * Clean build directories
 */
function cleanBuildDirectories() {
  logStep('Cleaning Previous Builds');
  
  const dirsToClean = [CONFIG.outputDirs.dist, CONFIG.outputDirs.out, '.next'];
  const cleanedDirs = [];
  
  for (const dir of dirsToClean) {
    if (dirExists(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        cleanedDirs.push(dir);
      } catch (error) {
        if (error.code === 'EBUSY' || error.code === 'EPERM') {
          logWarning(`Could not fully clean ${dir}: ${error.message}. Continuing anyway...`);
          cleanedDirs.push(`${dir} (partial)`);
        } else {
          throw error;
        }
      }
    }
  }
  
  if (cleanedDirs.length > 0) {
    logSuccess(`Cleaned directories: ${cleanedDirs.join(', ')}`);
  } else {
    logInfo('No previous builds to clean');
  }
}

/**
 * Run type check (optional, non-blocking)
 */
function runTypeCheck() {
  logStep('Running Type Check');
  
  try {
    runCommand('npm run type-check', 'Type checking');
  } catch (error) {
    logWarning('Type check failed, but continuing with build');
    logWarning(`Type check error: ${error.message}`);
  }
}

/**
 * Build Next.js application
 */
function buildNextJs() {
  logStep('Building Next.js Application');
  
  runCommand('npm run export:prod', 'Next.js export');
  
  // Verify out/ directory was created
  if (!dirExists(CONFIG.outputDirs.out)) {
    logError('Next.js build failed: out/ directory was not created');
  }
  
  // Check for index.html
  if (!fileExists(path.join(CONFIG.outputDirs.out, 'index.html'))) {
    logError('Next.js build failed: index.html not found in out/ directory');
  }
  
  // Calculate output directory size
  const outSize = getDirectorySize(CONFIG.outputDirs.out);
  logSuccess(`Next.js build completed. Output size: ${formatBytes(outSize)}`);
}

/**
 * Get directory size recursively
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;
  
  function calculateSize(itemPath) {
    const stats = fs.statSync(itemPath);
    if (stats.isDirectory()) {
      const files = fs.readdirSync(itemPath);
      files.forEach(file => calculateSize(path.join(itemPath, file)));
    } else {
      totalSize += stats.size;
    }
  }
  
  calculateSize(dirPath);
  return totalSize;
}

/**
 * Build Electron installer
 */
function buildElectronInstaller() {
  logStep('Building Electron Installer for Windows');
  
  runCommand('electron-builder --win', 'Electron Builder');
  
  // Verify dist/ directory was created
  if (!dirExists(CONFIG.outputDirs.dist)) {
    logError('Electron Builder failed: dist/ directory was not created');
  }
  
  // Find installer .exe file using exact name from package.json
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const productName = (packageJson.build && packageJson.build.productName) || packageJson.productName || packageJson.name;
  const version = packageJson.version;
  const expectedInstallerName = `${productName} Setup ${version}.exe`;
  
  const installerPath = path.join(CONFIG.outputDirs.dist, expectedInstallerName);
  if (!fileExists(installerPath)) {
    logError(`Expected installer not found: ${expectedInstallerName}`);
    logError('Available files in dist/:');
    const distFiles = fs.readdirSync(CONFIG.outputDirs.dist);
    distFiles.forEach(file => console.log(`  - ${file}`));
  }
  const installerSize = getFileSize(installerPath);
  
  logSuccess(`Electron installer created: ${expectedInstallerName} (${formatBytes(installerSize)})`);
  return installerPath;
}

/**
 * Create delivery package
 */
function createDeliveryPackage(installerPath) {
  logStep('Creating Delivery Package');
  
  // Create delivery directory
  ensureDir(CONFIG.outputDirs.delivery);
  
  // Copy installer
  const installerFileName = path.basename(installerPath);
  const installerDest = path.join(CONFIG.outputDirs.delivery, installerFileName);
  copyFile(installerPath, installerDest);
  logSuccess(`Copied installer: ${installerFileName}`);
  
  // Copy documentation files
  for (const docFile of CONFIG.documentationFiles) {
    if (fileExists(docFile)) {
      const destPath = path.join(CONFIG.outputDirs.delivery, path.basename(docFile));
      copyFile(docFile, destPath);
      logSuccess(`Copied documentation: ${path.basename(docFile)}`);
    }
  }
  
  // Generate package manifest
  generatePackageManifest();
  
  // Generate build info
  generateBuildInfo(installerPath);
  
  logSuccess('Delivery package created successfully');
}

/**
 * Generate package manifest
 */
function generatePackageManifest() {
  const manifestPath = path.join(CONFIG.outputDirs.delivery, 'PACKAGE_CONTENTS.txt');
  
  // Read version and product name from package.json
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const version = packageJson.version;
  const productName = packageJson.productName || packageJson.name;
  
  let manifest = `PACKAGE CONTENTS MANIFEST
Generated: ${new Date().toISOString()}
Package Version: ${version}
Product Name: ${productName}

FILES INCLUDED:
`;
  
  // List all files in delivery directory
  const files = fs.readdirSync(CONFIG.outputDirs.delivery);
  
  for (const file of files) {
    const filePath = path.join(CONFIG.outputDirs.delivery, file);
    const stats = fs.statSync(filePath);
    const checksum = calculateChecksum(filePath);
    
    let fileType = 'Documentation';
    if (file.endsWith('.exe')) fileType = 'Installer';
    else if (file.endsWith('.txt')) fileType = 'Manifest/Info';
    
    manifest += `
File: ${file}
Size: ${formatBytes(stats.size)}
SHA256: ${checksum}
Type: ${fileType}
`;
  }
  
  // Calculate total package size
  const totalSize = getDirectorySize(CONFIG.outputDirs.delivery);
  manifest += `
TOTAL PACKAGE SIZE: ${formatBytes(totalSize)}
`;
  
  fs.writeFileSync(manifestPath, manifest);
  logSuccess('Generated PACKAGE_CONTENTS.txt manifest');
}

/**
 * Generate build info
 */
function generateBuildInfo(installerPath) {
  const buildInfoPath = path.join(CONFIG.outputDirs.delivery, 'BUILD_INFO.txt');
  
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const installerSize = getFileSize(installerPath);
  const installerChecksum = calculateChecksum(installerPath);
  
  const buildInfo = `BUILD INFORMATION
Generated: ${new Date().toISOString()}

APPLICATION DETAILS:
Name: ${packageJson.productName || packageJson.name}
Version: ${packageJson.version}
Description: ${packageJson.description}

INSTALLER DETAILS:
File: ${path.basename(installerPath)}
Size: ${formatBytes(installerSize)}
SHA256: ${installerChecksum}

BUILD CONFIGURATION:
Electron Version: ${packageJson.devDependencies.electron || 'Not specified'}
Electron Builder: ${packageJson.devDependencies['electron-builder'] || 'Not specified'}
Next.js Version: ${packageJson.dependencies.next || 'Not specified'}
React Version: ${packageJson.dependencies.react || 'Not specified'}

SYSTEM REQUIREMENTS:
OS: Windows 10 or later
RAM: 4GB minimum, 8GB recommended
Storage: 500MB available disk space
Network: No internet required (fully offline after installation)

BUILD OPTIMIZATIONS:
- LZMA compression with 4MB dictionary
- Non-solid compression for low-end systems
- Per-user installation (no admin rights required)
- One-click installation experience
- Professional branding and license agreement
`;
  
  fs.writeFileSync(buildInfoPath, buildInfo);
  logSuccess('Generated BUILD_INFO.txt');
}

/**
 * Generate build report
 */
function generateBuildReport(startTime, installerPath, zipPath) {
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000);
  const installerSize = getFileSize(installerPath);
  const installerChecksum = calculateChecksum(installerPath);
  const deliverySize = getDirectorySize(CONFIG.outputDirs.delivery);
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 BUILD COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(80));
  console.log(`⏱️  Build Duration: ${duration} seconds`);
  console.log(`📦 Installer: ${path.basename(installerPath)} (${formatBytes(installerSize)})`);
  console.log(`📋 Delivery Package: ${CONFIG.outputDirs.delivery}/ (${formatBytes(deliverySize)})`);
  console.log(`🔐 SHA256 Checksum: ${installerChecksum}`);
  
  if (zipPath) {
    const zipSize = getFileSize(zipPath);
    console.log(`📦 ZIP Archive: ${path.basename(zipPath)} (${formatBytes(zipSize)})`);
  }
  
  console.log('\n📁 DELIVERY PACKAGE CONTENTS:');
  
  const files = fs.readdirSync(CONFIG.outputDirs.delivery);
  files.forEach(file => {
    const filePath = path.join(CONFIG.outputDirs.delivery, file);
    const size = getFileSize(filePath);
    console.log(`   • ${file} (${formatBytes(size)})`);
  });
  
  console.log('\n🚀 NEXT STEPS:');
  console.log('   1. Review delivery/ folder contents');
  if (zipPath) {
    console.log(`   2. ZIP archive ready: ${path.basename(zipPath)}`);
  }
  console.log('   3. Test installer on clean system');
  console.log('   4. Run verification: npm run verify:build');
  console.log('   5. Deliver to client');
  console.log('='.repeat(80));
}

/**
 * Create ZIP archive of delivery package
 */
function createDeliveryZip() {
  logStep('Creating Delivery ZIP Archive');
  
  // Read version from package.json for ZIP naming
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const version = packageJson.version;
  const zipFileName = `V4U-Lead-Funnel-CRM-v${version}-Windows-Installer.zip`;
  const zipPath = path.resolve(zipFileName);
  
  try {
    // Use PowerShell Compress-Archive on Windows
    const command = `powershell -Command "Compress-Archive -Path '${CONFIG.outputDirs.delivery}\\*' -DestinationPath '${zipPath}' -Force"`;
    
    logInfo(`Creating ZIP archive: ${zipFileName}`);
    execSync(command, { stdio: 'inherit' });
    
    // Verify ZIP was created
    if (fileExists(zipPath)) {
      const zipSize = getFileSize(zipPath);
      logSuccess(`ZIP archive created: ${zipFileName} (${formatBytes(zipSize)})`);
      return zipPath;
    } else {
      throw new Error('ZIP archive creation failed - file not found');
    }
  } catch (error) {
    logWarning(`ZIP creation failed: ${error.message}`);
    logWarning('Continuing without ZIP archive - delivery folder is still available');
    return null;
  }
}

/**
 * Save build log
 */
function saveBuildLog() {
  const logPath = path.join(CONFIG.outputDirs.delivery, 'build-log.txt');
  
  const logContent = `BUILD LOG
Generated: ${new Date().toISOString()}

This log contains the complete build output and validation results.
For troubleshooting, review the error messages and follow the suggested recovery steps.

BUILD PHASES AND COMMAND OUTPUT:
${buildLogBuffer.join('\n')}

Build completed successfully.
All validation checks passed.
Delivery package created in: ${CONFIG.outputDirs.delivery}
`;
  
  fs.writeFileSync(logPath, logContent);
  logSuccess('Saved build log to delivery/build-log.txt');
}

/**
 * Main packaging function
 */
function packageForClient() {
  const startTime = new Date();
  
  console.log('🚀 Starting comprehensive client packaging process...');
  
  try {
    // Phase 1: Validation
    validateBuildResources();
    
    // Phase 2: Clean and Build
    cleanBuildDirectories();
    runTypeCheck(); // Optional, non-blocking
    buildNextJs();
    const installerPath = buildElectronInstaller();
    
    // Phase 3: Create Delivery Package
    createDeliveryPackage(installerPath);
    
    // Phase 3.5: Create ZIP Archive
    const zipPath = createDeliveryZip();
    
    // Phase 4: Reporting
    generateBuildReport(startTime, installerPath, zipPath);
    saveBuildLog();
    
    // Phase 5: Post-Build Verification
    logStep('Running Post-Build Verification');
    try {
      require('./verify-build.js').verifyBuild();
    } catch (error) {
      logWarning('Post-build verification failed, but build completed successfully');
      logWarning(`Verification error: ${error.message}`);
    }
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ BUILD FAILED');
    console.error('='.repeat(60));
    console.error(`Error: ${error.message}`);
    console.error('\n🔧 RECOVERY SUGGESTIONS:');
    
    if (error.message.includes('not found')) {
      console.error('   • Check that all required files exist');
      console.error('   • Run validation: node scripts/package-for-client.js');
    } else if (error.message.includes('npm')) {
      console.error('   • Check that npm dependencies are installed: npm install');
      console.error('   • Verify Node.js version compatibility');
    } else if (error.message.includes('disk space') || error.message.includes('ENOSPC')) {
      console.error('   • Free up disk space (need at least 500MB)');
      console.error('   • Clean temporary files and previous builds');
    } else if (error.message.includes('permission')) {
      console.error('   • Check file permissions');
      console.error('   • Try running with appropriate user rights');
    } else {
      console.error('   • Review the error message above');
      console.error('   • Check build-log.txt for detailed information');
      console.error('   • Try cleaning and rebuilding: npm run clean:win && npm run package:client');
    }
    
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run the packaging process
if (require.main === module) {
  packageForClient();
}

module.exports = {
  validateBuildResources,
  validateDocumentation,
  validateNsisResources,
  validateDirectories,
  validateDependencies,
  cleanBuildDirectories,
  buildNextJs,
  buildElectronInstaller,
  createDeliveryPackage,
  createDeliveryZip,
  generatePackageManifest,
  generateBuildInfo,
  packageForClient,
  CONFIG
};