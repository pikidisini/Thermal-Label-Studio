pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timestamps()
    timeout(time: 45, unit: 'MINUTES')
  }

  parameters {
    string(name: 'SOURCE_DIR', defaultValue: '/workspace/thermal-label-studio', description: 'Read-only authorized local web_app snapshot. It is copied into the Jenkins workspace; this pipeline never checks out or deploys code.')
  }

  stages {
    stage('Snapshot authorized source') {
      steps {
        script {
          if (!params.SOURCE_DIR?.trim()) {
            error('SOURCE_DIR is required. Configure a reviewed local snapshot; this job intentionally does not fetch a remote checkout.')
          }
        }
        sh '''set -eu
          test -f "$SOURCE_DIR/sonar-project.properties" && test -f "$SOURCE_DIR/scripts/check_project.py"
          case "$WORKSPACE" in "$JENKINS_HOME"/workspace/*) ;; *) echo 'Refusing an unexpected Jenkins workspace path.' >&2; exit 2;; esac
          SNAPSHOT="$WORKSPACE/source"
          case "$SNAPSHOT" in "$JENKINS_HOME"/workspace/*/source) ;; *) echo 'Refusing an unsafe snapshot cleanup path.' >&2; exit 2;; esac
          rm -rf -- "$SNAPSHOT"
          mkdir -p "$SNAPSHOT"
          for path in backend/app backend/tests backend/schema engine frontend/src frontend/tests scripts; do
            test -d "$SOURCE_DIR/$path" || { echo "Required source directory is absent: $path" >&2; exit 2; }
            mkdir -p "$SNAPSHOT/$path"
            rsync -a --exclude '__pycache__/' --exclude '*.pyc' --exclude '.venv/' --exclude 'node_modules/' --exclude '.pytest_cache/' --exclude '.mypy_cache/' --exclude '*.zip' --exclude '*.tar' --exclude '*.tar.*' -- "$SOURCE_DIR/$path/" "$SNAPSHOT/$path/"
          done
          for path in requirements.txt sonar-project.properties Dockerfile docker-compose.yml frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/vite.config.js frontend/playwright.config.js frontend/index.html frontend/postcss.config.js frontend/tailwind.config.js; do
            test -f "$SOURCE_DIR/$path" || { echo "Required source file is absent: $path" >&2; exit 2; }
            mkdir -p "$(dirname "$SNAPSHOT/$path")"
            cp -- "$SOURCE_DIR/$path" "$SNAPSHOT/$path"
          done'''
        dir("${env.WORKSPACE}/source") {
          sh 'test -f sonar-project.properties && test -f scripts/check_project.py'
        }
      }
    }

    stage('Source gate') {
      steps {
        dir("${env.WORKSPACE}/source") {
          sh '''python3.14 -m venv .venv-ci
            . .venv-ci/bin/activate
            pip install --disable-pip-version-check -r requirements.txt
            test -f frontend/package-lock.json || { echo 'BLOCKED: frontend/package-lock.json is required for repeatable Jenkins dependency installation.' >&2; exit 2; }
            (cd frontend && npm ci)
            python3 -B scripts/check_coverage.py
            COVERAGE_DIR="$(find .tmp -maxdepth 1 -type d -name 'coverage-*' | sort | tail -n 1)"
            python3 -B scripts/check_coverage.py --verify-inputs "$COVERAGE_DIR"
            mkdir -p .tmp/coverage
            cp "$COVERAGE_DIR/python.xml" .tmp/coverage/python.xml
            cp "$COVERAGE_DIR/frontend/lcov.info" .tmp/coverage/frontend.lcov'''
        }
      }
    }

    stage('SonarQube analysis') {
      steps {
        dir("${env.WORKSPACE}/source") {
          withCredentials([string(credentialsId: 'thermal-label-sonarqube-token', variable: 'SONAR_TOKEN')]) {
              sh '''set -eu
              test -x /opt/sonar-scanner/bin/sonar-scanner || { echo 'Bundled SonarScanner is absent.' >&2; exit 2; }
              export SONAR_HOST_URL=http://host.docker.internal:9004
              export SONAR_USER_HOME="$WORKSPACE/.sonar-cache"
              export SONAR_SCANNER_JAVA_OPTS='-Xmx768m'
              SCAN_WORK="$(mktemp -d "$WORKSPACE/.sonar-working.XXXXXX")"
              case "$SCAN_WORK" in "$WORKSPACE"/.sonar-working.*) ;; *) echo 'Refusing an unsafe scanner cleanup path.' >&2; exit 2;; esac
              trap 'rm -rf -- "$SCAN_WORK"' EXIT
              SNAPSHOT_HASH="$(find . '(' -path './.venv-ci' -o -path '*/node_modules' -o -path '*/dist' -o -path './.sonar-cache' ')' -prune -o -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
              /opt/sonar-scanner/bin/sonar-scanner \
                "-Dsonar.working.directory=$SCAN_WORK" \
                -Dsonar.python.version=3.14 \
                "-Dsonar.buildString=snapshot-sha256=$SNAPSHOT_HASH" \
                -Dsonar.qualitygate.wait=true'''
          }
        }
      }
    }
  }
}
