import argparse
import json
import os
import pathlib
import shutil
import subprocess
from multiprocessing.dummy import Pool


def main():
    env_keys = ["NETWORK_ID", "PROXY_URL", "NESTED_ACCOUNTS"]
    missing_keys = []
    for key in env_keys:
        if key not in os.environ:
            missing_keys.append(key)
    if missing_keys:
        raise ValueError(f"Missing {', '.join(missing_keys)} in environment variables")

    parser = argparse.ArgumentParser(description="Run OZ tests in parallel")
    parser.add_argument(
        "-j", "--jobs", help="number of parallel jobs", type=int, required=True
    )
    args = parser.parse_args()
    run(args.jobs)


def run(jobs: int):
    print(f"Running OpenZeppelin tests in {jobs} jobs")

    cwd = pathlib.Path().parent.absolute()
    (cwd / "results").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(cwd / "package.json", cwd / "results" / "openzeppelin-package.json")

    nested_accounts = os.environ["NESTED_ACCOUNTS"]
    print("%r" % nested_accounts)
    keys_env = json.loads(nested_accounts)
    
    tests = list(pathlib.Path(f"{cwd}/test").rglob("*.test.js"))
    tests = [str(test) for test in tests]

    def run_oz_file(file_name):
        print(f"Run {file_name}")
        keys = keys_env.pop(0)
        env = os.environ.copy()
        env["PRIVATE_KEYS"] = ",".join(keys)
        print(",".join(keys))

        out = subprocess.run(
            f"npx hardhat test {file_name}",
            shell=True,
            cwd=cwd,
            capture_output=True,
            env=env,
        )
        stdout = out.stdout.decode()
        stderr = out.stderr.decode()
        print(f"Test {file_name} finished with code {out.returncode}")
        print(stdout)
        print(stderr)
        keys_env.append(keys)
        log_dirs = (
            cwd / "results" / file_name.replace(".", "_").replace("/", "_")
        )
        log_dirs.mkdir(parents=True, exist_ok=True)
        with open(log_dirs / "stdout.log", "w") as f:
            f.write(stdout)
        with open(log_dirs / "stderr.log", "w") as f:
            f.write(stderr)

    pool = Pool(jobs)
    pool.map(run_oz_file, tests)
    pool.close()
    pool.join()


main()
