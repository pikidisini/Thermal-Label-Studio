pipeline {
  agent { label 'tls-build' }
  options {
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timestamps()
    timeout(time: 120, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }
  triggers { pollSCM('H/5 * * * *') }
  stages {
    stage('Checkout trusted main') {
      steps {
        checkout scm
        script { env.RELEASE_SHA = sh(returnStdout: true, script: 'git rev-parse HEAD').trim() }
      }
    }
    stage('Linux source, measured coverage and mock browser') {
      steps { sh 'python3 -B scripts/ci_build.py source --commit "$RELEASE_SHA"' }
    }
    stage('Exact-candidate SonarQube quality gate') {
      steps {
        withCredentials([string(credentialsId: 'thermal-label-sonarqube-token', variable: 'SONAR_TOKEN')]) {
          sh 'set +x; python3 -B scripts/ci_build.py sonar --commit "$RELEASE_SHA"'
        }
      }
    }
    stage('Build and real isolated storage acceptance') {
      steps { sh 'python3 -B scripts/ci_build.py image --commit "$RELEASE_SHA"' }
    }
    stage('Automatic named-target release') {
      steps { sh 'python3 -B scripts/ci_build.py deploy --commit "$RELEASE_SHA"' }
    }
  }
  post {
    always {
      archiveArtifacts artifacts: ".tmp/ci-${env.BUILD_TAG}/**/*.log,.tmp/ci-${env.BUILD_TAG}/**/result.json,.tmp/ci-${env.BUILD_TAG}/**/python.xml,.tmp/ci-${env.BUILD_TAG}/**/lcov.info,.tmp/ci-${env.BUILD_TAG}/candidate.json,.tmp/ci-${env.BUILD_TAG}/deployment.json", allowEmptyArchive: true, fingerprint: true
      script {
        if (env.RELEASE_SHA) { sh 'python3 -B scripts/ci_build.py clean --commit "$RELEASE_SHA"' }
      }
    }
  }
}
