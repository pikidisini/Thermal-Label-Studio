import jenkins.model.Jenkins
import jenkins.model.JenkinsLocationConfiguration
import hudson.model.Node
import hudson.slaves.DumbSlave
import hudson.slaves.JNLPLauncher
import jenkins.slaves.JnlpAgentReceiver
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
import hudson.plugins.git.GitSCM
import hudson.plugins.git.BranchSpec
import hudson.plugins.git.UserRemoteConfig

def instance = Jenkins.get()
instance.setNumExecutors(0)
JenkinsLocationConfiguration.get().setUrl('http://192.168.254.58:8081/')
['tls-build', 'tls-monitor'].each { name ->
    def node = instance.getNode(name)
    if (node == null) {
        node = new DumbSlave(name, '/opt/thermal-label-ci/work/' + (name == 'tls-build' ? 'build' : 'monitor'), new JNLPLauncher())
        instance.addNode(node)
    }
    node.setNumExecutors(1)
    node.setMode(Node.Mode.EXCLUSIVE)
    node.setLabelString(name)
    node.save()
    def secret = new File('/run/tls-agents/' + name + '.secret')
    secret.text = JnlpAgentReceiver.DATABASE.getSecretOf(name)
    secret.setReadable(false, false); secret.setWritable(false, false)
    secret.setReadable(true, true); secret.setWritable(true, true)
}

// Old job histories and credentials remain; local/prototype launch paths retire.
['thermal-label-source-quality', 'thermal-label-local-simulation',
 'rollback-thermal-label-local-simulation', 'thermal-label-branch-check'].each { name ->
    def job = instance.getItem(name)
    if (job != null) { job.setDisabled(true); job.save() }
}

if (instance.getItem('thermal-label-release') == null) {
    def git = new GitSCM([new UserRemoteConfig('https://github.com/pikidisini/Thermal-Label-Studio.git', null, null, null)],
                         [new BranchSpec('*/main')], null, null, [])
    def definition = new CpsScmFlowDefinition(git, 'Jenkinsfile')
    definition.setLightweight(true)
    def job = instance.createProject(WorkflowJob, 'thermal-label-release')
    job.setDefinition(definition)
    // Explicit cutover after migration/qualification; bootstrap cannot release.
    job.setDisabled(true)
    job.save()
}
if (instance.getItem('thermal-label-qualification') == null) {
    def git = new GitSCM([new UserRemoteConfig('https://github.com/pikidisini/Thermal-Label-Studio.git', null, null, null)],
                         [new BranchSpec('*/codex/maintenance-ci')], null, null, [])
    def definition = new CpsScmFlowDefinition(git, 'Jenkinsfile')
    definition.setLightweight(true)
    def job = instance.createProject(WorkflowJob, 'thermal-label-qualification')
    job.setDefinition(definition)
    job.setDisabled(false)
    job.save()
}
def monitorJob = instance.getItem('thermal-label-monitor')
def newMonitor = monitorJob == null
if (newMonitor) monitorJob = instance.createProject(WorkflowJob, 'thermal-label-monitor')
    monitorJob.setDefinition(new CpsFlowDefinition('''pipeline {
      agent { label 'tls-monitor' }
      options { disableConcurrentBuilds(); buildDiscarder(logRotator(numToKeepStr: '20')); timeout(time: 2, unit: 'MINUTES') }
      triggers { cron('* * * * *') }
      stages { stage('Read independent server monitor') { steps { script {
        sh 'python3 /opt/ci-monitor-view.py /monitor/status.json'
        def status = readFile('state.txt').trim()
        currentBuild.description = readFile('description.txt').trim()
        archiveArtifacts artifacts: 'status.json', fingerprint: true
        if (status == 'DOWN') { error('Application or storage is unavailable; inspect sanitized status artifact') }
        if (status == 'WARNING') { unstable('Resource warning or initial health observation') }
      } } } }
    }''', true))
    monitorJob.setDisabled(false)
    monitorJob.save()
    if (newMonitor) monitorJob.scheduleBuild2(15)
['qualification', 'release'].each { kind ->
    def marker = new File('/run/tls-agents/' + kind + '-ready')
    if (marker.isFile()) {
        def job = instance.getItem('thermal-label-' + kind)
        job.setDisabled(false)
        job.save()
        if (!job.isInQueue() && !job.isBuilding()) job.scheduleBuild2(15)
        marker.delete()
    }
}
instance.save()
println('CI server bootstrap completed; credentials/history retained; release job disabled pending cutover.')
