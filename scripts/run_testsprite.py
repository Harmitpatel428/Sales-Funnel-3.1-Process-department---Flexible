
import os
import glob
import asyncio
import sys
import subprocess
import time

# Colors for output
GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"

async def run_test_file(filepath):
    print(f"Running {filepath}...")
    start_time = time.time()
    
    # We run each test file as a separate process to ensure isolation
    process = await asyncio.create_subprocess_exec(
        sys.executable, filepath,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    stdout, stderr = await process.communicate()
    end_time = time.time()
    duration = end_time - start_time
    
    if process.returncode == 0:
        print(f"{GREEN}PASS{RESET}: {filepath} ({duration:.2f}s)")
        return True, stdout.decode(), stderr.decode()
    else:
        print(f"{RED}FAIL{RESET}: {filepath} ({duration:.2f}s)")
        print("STDOUT:", stdout.decode())
        print("STDERR:", stderr.decode())
        return False, stdout.decode(), stderr.decode()

async def main():
    test_dir = os.path.join(os.getcwd(), "testsprite_tests")
    test_files = sorted(glob.glob(os.path.join(test_dir, "TC*.py")))
    
    if not test_files:
        print("No test files found in testsprite_tests/")
        return

    print(f"Found {len(test_files)} tests.")
    
    results = []
    
    for test_file in test_files:
        success, out, err = await run_test_file(test_file)
        results.append((test_file, success))

    print("\n" + "="*30)
    print("TEST SUMMARY")
    print("="*30)
    
    passed = sum(1 for _, success in results if success)
    failed = len(results) - passed
    
    for test_file, success in results:
        status = f"{GREEN}PASS{RESET}" if success else f"{RED}FAIL{RESET}"
        print(f"{status}: {os.path.basename(test_file)}")
        
    print(f"\nTotal: {len(results)}, Passed: {passed}, Failed: {failed}")
    
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
