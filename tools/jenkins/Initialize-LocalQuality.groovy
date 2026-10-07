import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition
import hudson.model.ParametersDefinitionProperty
import hudson.model.StringParameterDefinition
import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl
import hudson.util.Secret

// One-time bootstrap. Reused Jenkins home, users and job histories are preserved.
// The override mounting this file is removed after initialization.
def instance = Jenkins.get()
def tokenFile = new File('/run/local-sonar.env')
def tokenLine = tokenFile.readLines().find { it.startsWith('SONAR_TOKEN=') }
if (!tokenLine) throw new IllegalStateException('Local scanner token is absent')
def store = SystemCredentialsProvider.getInstance().getStore()
def domain = com.cloudbees.plugins.credentials.domains.Domain.global()
def credentialId = 'thermal-label-sonarqube-token'
def existing = store.getCredentials(domain).find { it.id == credentialId }
def replacement = new StringCredentialsImpl(CredentialsScope.GLOBAL, credentialId,
    'Local Thermal Label SonarQube project analysis only', Secret.fromString(tokenLine.substring('SONAR_TOKEN='.length())))
if (existing) store.updateCredentials(domain, existing, replacement)
else store.addCredentials(domain, replacement)

// Archived deployment jobs must not redeploy prototype containers on restart.
def backup = new File(instance.rootDir, 'local-quality-bootstrap-backup')
backup.mkdirs()
['thermal-label-local-simulation', 'rollback-thermal-label-local-simulation', 'thermal-label-branch-check'].each { name ->
    def oldJob = instance.getItem(name)
    if (oldJob) {
        def target = new File(backup, name + '.xml')
        if (!target.exists()) target.text = oldJob.configFile.asString()
        oldJob.setDisabled(true)
        oldJob.save()
    }
}
def jobName = 'thermal-label-source-quality'
def job = instance.getItem(jobName)
if (!job) job = instance.createProject(WorkflowJob, jobName)
if (!(job instanceof WorkflowJob)) throw new IllegalStateException('Conflicting job type')
job.setDefinition(new CpsFlowDefinition(new File('/workspace/thermal-label-studio/Jenkinsfile').text, true))
job.addProperty(new ParametersDefinitionProperty(new StringParameterDefinition('SOURCE_DIR', '/workspace/thermal-label-studio', 'Authorized local source snapshot')))
job.setDisabled(false)
job.save()
instance.save()
if (job.nextBuildNumber == 1) {
    job.scheduleBuild2(15)
    println('First local quality verification build queued; no recurring trigger configured.')
}
println('Local quality job configured; archived deploy jobs disabled with configuration backups.')
