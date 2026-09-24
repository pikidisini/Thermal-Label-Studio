pipeline {
    agent any
    options {
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
        timestamps()
        timeout(time: 45, unit: 'MINUTES')
    }
    triggers {
        pollSCM('H/5 * * * *')
    }
    stages {
        stage('Checkout') {
            steps {
                deleteDir()
                checkout scm
                script {
                    env.IMAGE_TAG = "tls-local-sim:${sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()}"
                }
            }
        }
        stage('Backend tests') {
            steps {
                sh '''
                    python3 -m venv .venv-jenkins
                    .venv-jenkins/bin/pip install --disable-pip-version-check -r backend/requirements.txt
                    .venv-jenkins/bin/python -m pytest backend/tests -q -p no:cacheprovider
                '''
            }
        }
        stage('Frontend tests and build') {
            steps {
                sh '''
                    cd frontend
                    npm ci
                    npm run build
                    npm test
                    npm exec tsc -- --noEmit
                '''
            }
        }
        stage('Build application image') {
            steps {
                sh 'docker build --tag "$IMAGE_TAG" .'
            }
        }
        stage('Deploy local simulation') {
            when {
                expression {
                    def remoteMain = sh(script: 'git ls-remote origin refs/heads/main', returnStdout: true).trim()
                    if (!remoteMain) {
                        error('Cannot verify origin/main; refusing deployment.')
                    }
                    return sh(script: 'git rev-parse HEAD', returnStdout: true).trim() == remoteMain.tokenize()[0]
                }
            }
            steps {
                withCredentials([string(credentialsId: 'tls-pilot-operator-secret', variable: 'PILOT_OPERATOR_SECRET')]) {
                    sh 'bash ops/jenkins/deploy-local.sh "$IMAGE_TAG"'
                }
            }
        }
    }
}
