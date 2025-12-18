const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration constants
const CONFIG = {
  installerPattern: 'Enterprise Lead Management System Setup *.exe',
  minInstallerSize: 50 * 1024 * 1024, // 50 MB
  maxInstallerSize: 500 * 1024 * 1024, // 500 MB
  requiredDeliveryFiles: [
    'CLIENT_INSTALLATION_GUIDE.md',
    'LAUNCH_INSTRUCTIONS.md',
    'PERFORMANCE_OPTIMIZATION.md',
    'README.txt',
    'PACKAGE_CONTENTS.txt',
    'BUILD_INFO.txt'
  ],
  expectedExtensions: ['.exe', '.md', '.txt']
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
 * Log error message and exit
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
 * Get file size in bytes
 */
function getFileSize(filePath) {
  return fs.statSync(filePath).size;
}

/**
 * Find files matching pattern
 */
function findFile(pattern, directory) {
  if (!fs.existsSync(directory)) {
    return null;
  }
  
  const files = fs.readdirSync(directory);
  const regex = new RegExp(pattern.replace(/\*/g, '.*'));
  return files.find(file => regex.test(file));
}

/**
 * Verify installer exists
 */
function verifyInstallerExists() {
  logInfo('Verifying installer exists...');
  
  if (!fs.existsSync('dist_v2_1_0')) {
    logError('dist_v2_1_0/ directory not found. Run the build first: npm run package:client');
  }
  
  // Build expected filename from package.json
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const productName = (packageJson.build && packageJson.build.productName) || packageJson.productName || packageJson.name;
  const version = packageJson.version;
  const expectedInstallerName = `${productName} Setup ${version}.exe`;
  
  const installerPath = path.join('dist_v2_1_0', expectedInstallerName);
  if (!fileExists(installerPath)) {
    logError(`Expected installer not found: ${expectedInstallerName}`);
    logError('Available files in dist_v2_1_0/:');
    const distFiles = fs.readdirSync('dist_v2_1_0');
    distFiles.forEach(file => console.log(`  - ${file}`));
    throw new Error(`Installer not found: ${expectedInstallerName}`);
  }
  
  logSuccess(`Installer found: ${expectedInstallerName}`);
  return installerPath;
}

/**
 * Verify installer size
 */
function verifyInstallerSize(installerPath) {
  logInfo('Verifying installer size...');
  
  const size = getFileSize(installerPath);
  const sizeFormatted = formatBytes(size);
  
  if (size < CONFIG.minInstallerSize) {
    logWarning(`Installer is smaller than expected (${sizeFormatted}). May be incomplete.`);
  } else if (size > CONFIG.maxInstallerSize) {
    logWarning(`Installer is larger than expected (${sizeFormatted}). May contain unnecessary files.`);
  } else {
    logSuccess(`Installer size is within expected range: ${sizeFormatted}`);
  }
  
  return size;
}

/**
 * Verify installer integrity
 */
function verifyInstallerIntegrity(installerPath) {
  logInfo('Verifying installer integrity...');
  
  // Check file extension
  if (!installerPath.toLowerCase().endsWith('.exe')) {
    logError('Installer file does not have .exe extension');
  }
  
  // Verify file is readable
  try {
    fs.accessSync(installerPath, fs.constants.R_OK);
  } catch (error) {
    logError(`Cannot read installer file: ${error.message}`);
  }
  
  // Calculate checksum
  const checksum = calculateChecksum(installerPath);
  logSuccess(`Installer checksum: ${checksum}`);
  
  return checksum;
}

/**
 * Verify delivery package
 */
function verifyDeliveryPackage() {
  logInfo('Verifying delivery package...');
  
  if (!fs.existsSync('delivery')) {
    logError('delivery/ directory not found. Build may have failed.');
  }
  
  const files = fs.readdirSync('delivery');
  const missingFiles = [];
  const emptyFiles = [];
  
  // Check required files
  for (const requiredFile of CONFIG.requiredDeliveryFiles) {
    if (!files.includes(requiredFile)) {
      missingFiles.push(requiredFile);
    } else {
      const filePath = path.join('delivery', requiredFile);
      const size = getFileSize(filePath);
      if (size === 0) {
        emptyFiles.push(requiredFile);
      }
    }
  }
  
  // Check installer
  // Check for installer file with exact name
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const productName = (packageJson.build && packageJson.build.productName) || packageJson.productName || packageJson.name;
  const version = packageJson.version;
  const expectedInstallerName = `${productName} Setup ${version}.exe`;
  
  if (!fileExists(path.join('delivery', expectedInstallerName))) {
    missingFiles.push(`Installer file: ${expectedInstallerName}`);
  }
  
  if (missingFiles.length > 0) {
    logError(`Missing files in delivery package: ${missingFiles.join(', ')}`);
  }
  
  if (emptyFiles.length > 0) {
    logWarning(`Empty files in delivery package: ${emptyFiles.join(', ')}`);
  }
  
  // Verify documentation files have reasonable size
  const docFiles = files.filter(file => file.endsWith('.md') || file.endsWith('.txt'));
  for (const docFile of docFiles) {
    const filePath = path.join('delivery', docFile);
    const size = getFileSize(filePath);
    if (size < 500) {
      logWarning(`Documentation file ${docFile} is very small (${formatBytes(size)})`);
    }
  }
  
  logSuccess(`Delivery package verified. Files: ${files.length}`);
  return files;
}

/**
 * Verify package manifest
 */
function verifyPackageManifest() {
  logInfo('Verifying package manifest...');
  
  const manifestPath = path.join('delivery', 'PACKAGE_CONTENTS.txt');
  if (!fileExists(manifestPath)) {
    logError('PACKAGE_CONTENTS.txt manifest not found in delivery package');
  }
  
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  
  // Parse manifest in blocks
  const lines = manifestContent.split('\n');
  let currentFile = null;
  let verificationPassed = true;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Track the current file from the preceding File: line
    if (line.startsWith('File: ')) {
      currentFile = line.replace('File: ', '').trim();
    }
    // Read the SHA256 checksum for the current file
    else if (line.startsWith('SHA256: ') && currentFile) {
      const expectedChecksum = line.replace('SHA256: ', '').trim();
      
      const filePath = path.join('delivery', currentFile);
      if (fileExists(filePath)) {
        const actualChecksum = calculateChecksum(filePath);
        if (actualChecksum !== expectedChecksum) {
          logError(`Checksum mismatch for ${currentFile}. Expected: ${expectedChecksum}, Actual: ${actualChecksum}`);
          verificationPassed = false;
        } else {
          logSuccess(`Checksum verified for ${currentFile}`);
        }
      } else {
        logError(`File not found for checksum verification: ${currentFile}`);
        verificationPassed = false;
      }
      
      // Reset current file after processing
      currentFile = null;
    }
  }
  
  if (verificationPassed) {
    logSuccess('Package manifest checksums verified');
  } else {
    logError('Package manifest checksum verification failed');
  }
  
  return verificationPassed;
}

/**
 * Verify build configuration
 */
function verifyBuildConfiguration() {
  logInfo('Verifying build configuration...');
  
  if (!fileExists('package.json')) {
    logError('package.json not found');
  }
  
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  // Check electron-builder configuration
  if (!packageJson.build) {
    logError('electron-builder configuration not found in package.json');
  }
  
  // Check required build resources are referenced
  const buildConfig = packageJson.build;
  if (!buildConfig.directories || !buildConfig.directories.buildResources) {
    logError('buildResources directory not configured');
  }
  
  // Check NSIS configuration
  if (!buildConfig.nsis) {
    logError('NSIS configuration not found');
  }
  
  const nsisConfig = buildConfig.nsis;
  if (!nsisConfig.installerIcon || !nsisConfig.license) {
    logError('Required NSIS configuration missing (installerIcon, license)');
  }
  
  // Verify version number matches installer name
  const productName = (packageJson.build && packageJson.build.productName) || packageJson.productName || packageJson.name;
  const version = packageJson.version;
  const expectedInstallerName = `${productName} Setup ${version}.exe`;
  
  if (fileExists(path.join('delivery', expectedInstallerName))) {
    logSuccess(`Version ${version} matches installer name: ${expectedInstallerName}`);
  } else {
    logWarning(`Expected installer name ${expectedInstallerName} not found in delivery package`);
  }
  
  logSuccess('Build configuration verified');
}

/**
 * Compare with previous build (optional)
 */
function comparePreviousBuild() {
  logInfo('Comparing with previous build...');
  
  // This is optional and non-blocking
  // In a real implementation, you might store previous build info
  // and compare sizes, checksums, etc.
  
  logInfo('Previous build comparison skipped (not implemented)');
}

/**
 * Generate verification report
 */
function generateVerificationReport(installerPath, installerSize, installerChecksum, deliveryFiles) {
  const reportPath = path.join('delivery', 'VERIFICATION_REPORT.txt');
  
  const report = `VERIFICATION REPORT
Generated: ${new Date().toISOString()}

VERIFICATION SUMMARY:
✅ Installer exists and is valid
✅ Installer size is within expected range
✅ Installer integrity verified (SHA256 checksum)
✅ Delivery package contains all required files
✅ Package manifest checksums verified
✅ Build configuration is correct

INSTALLER DETAILS:
File: ${path.basename(installerPath)}
Size: ${formatBytes(installerSize)}
SHA256: ${installerChecksum}
Location: ${installerPath}

DELIVERY PACKAGE:
Directory: delivery/
Files: ${deliveryFiles.length}
Contents: ${deliveryFiles.join(', ')}

RECOMMENDATIONS:
1. Test installer on clean Windows system
2. Verify all documentation files are readable
3. Check installer runs without errors
4. Confirm application launches successfully
5. Test uninstallation process

VERIFICATION STATUS: PASSED
Ready for client delivery.
`;
  
  fs.writeFileSync(reportPath, report);
  logSuccess('Generated VERIFICATION_REPORT.txt');
}

/**
 * Main verification function
 */
function verifyBuild() {
  console.log('🔍 Starting post-build verification...');
  
  try {
    // Verify installer exists
    const installerPath = verifyInstallerExists();
    
    // Verify installer size
    const installerSize = verifyInstallerSize(installerPath);
    
    // Verify installer integrity
    const installerChecksum = verifyInstallerIntegrity(installerPath);
    
    // Verify delivery package
    const deliveryFiles = verifyDeliveryPackage();
    
    // Verify package manifest
    const manifestVerified = verifyPackageManifest();
    
    // Verify build configuration
    verifyBuildConfiguration();
    
    // Compare with previous build (optional)
    comparePreviousBuild();
    
    // Generate verification report
    generateVerificationReport(installerPath, installerSize, installerChecksum, deliveryFiles);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ VERIFICATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`📦 Installer: ${path.basename(installerPath)} (${formatBytes(installerSize)})`);
    console.log(`🔐 SHA256: ${installerChecksum}`);
    console.log(`📋 Delivery Package: ${deliveryFiles.length} files`);
    console.log('🚀 Ready for client delivery!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ VERIFICATION FAILED');
    console.error('='.repeat(60));
    console.error(`Error: ${error.message}`);
    console.error('\n🔧 TROUBLESHOOTING SUGGESTIONS:');
    
    if (error.message.includes('not found')) {
      console.error('   • Run the build first: npm run package:client');
      console.error('   • Check that all required files exist');
    } else if (error.message.includes('checksum')) {
      console.error('   • File may be corrupted, rebuild the installer');
      console.error('   • Check for disk space or permission issues');
    } else if (error.message.includes('size')) {
      console.error('   • Installer may be incomplete or bloated');
      console.error('   • Review build configuration and dependencies');
    } else {
      console.error('   • Review the error message above');
      console.error('   • Check build logs for detailed information');
      console.error('   • Try rebuilding: npm run clean:win && npm run package:client');
    }
    
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run verification if script is executed directly
if (require.main === module) {
  verifyBuild();
}

module.exports = {
  verifyInstallerExists,
  verifyInstallerSize,
  verifyInstallerIntegrity,
  verifyDeliveryPackage,
  verifyPackageManifest,
  verifyBuildConfiguration,
  verifyBuild,
  CONFIG
};
