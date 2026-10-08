import jenkins.model.Jenkins
import hudson.model.User
import hudson.model.Item
import hudson.security.HudsonPrivateSecurityRealm
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.security.GlobalMatrixAuthorizationStrategy
import hudson.security.AuthorizationStrategy
import jenkins.security.ApiTokenProperty
import groovy.json.JsonOutput

// Run through an authenticated admin Script Console/API; never on MCP startup.
// Only creates the reader and its authorization. No jobs or builds are changed.
def instance = Jenkins.get()
def readerId = 'thermal_label_ai_readonly'
def realm = instance.securityRealm
def previous = instance.authorizationStrategy
if (!(realm instanceof HudsonPrivateSecurityRealm)) throw new IllegalStateException('Local user realm required')
if (User.getById(readerId, false) != null) throw new IllegalStateException('Reader already exists; no overwrite')
if (!(previous instanceof FullControlOnceLoggedInAuthorizationStrategy) &&
    !(previous instanceof GlobalMatrixAuthorizationStrategy)) {
    throw new IllegalStateException('Unsupported authorization strategy; review required')
}
def oldUsers = realm.allUsers.findAll { it.id != readerId }
if (oldUsers.isEmpty()) throw new IllegalStateException('Existing administrative users required')
def matrix = previous instanceof GlobalMatrixAuthorizationStrategy ? previous : new GlobalMatrixAuthorizationStrategy()
if (previous instanceof FullControlOnceLoggedInAuthorizationStrategy) {
    // Preserve the full rights of existing local logins, without granting them to future users.
    oldUsers.each { matrix.add(Jenkins.ADMINISTER, it.id) }
    if (!previous.denyAnonymousReadAccess) matrix.add(Jenkins.READ, 'anonymous')
}
def existingAuthenticatedAdmin = matrix.grantedPermissions[Jenkins.ADMINISTER]?.contains('authenticated')
if (existingAuthenticatedAdmin) throw new IllegalStateException('Authenticated group has admin rights; manual review required')
def job = instance.getItemByFullName('thermal-label-source-quality')
if (job == null) throw new IllegalStateException('Expected quality job missing')
// Global Job/Read grants read-only access to jobs; MCP additionally allowlists the quality job.
// This is explicit because GlobalMatrix does not provide per-job scope by itself.
matrix.add(Jenkins.READ, readerId)
matrix.add(Item.READ, readerId)
def random = new java.security.SecureRandom()
byte[] bytes = new byte[36]
random.nextBytes(bytes)
def password = java.util.Base64.urlEncoder.withoutPadding().encodeToString(bytes)
def backup = new File(instance.rootDir, 'mcp-reader-security-backup-20261008.xml')
if (backup.exists()) throw new IllegalStateException('Backup already exists; inspect previous attempt')
backup.bytes = instance.configFile.file.bytes
def reader = realm.createAccount(readerId, password)
def generated = reader.getProperty(ApiTokenProperty.class).tokenStore.generateNewToken('thermal-label-mcp-readonly')
reader.save()
instance.setAuthorizationStrategy(matrix)
instance.save()
def authentication = reader.impersonate2()
def acl = instance.getACL()
if (!acl.hasPermission2(authentication, Jenkins.READ) || acl.hasPermission2(authentication, Jenkins.ADMINISTER)) {
    throw new IllegalStateException('Reader global permission verification failed')
}
[Item.BUILD, Item.CONFIGURE, Item.CREATE, Item.DELETE, Item.CANCEL, Item.WORKSPACE].each { permission ->
    if (job.getACL().hasPermission2(authentication, permission)) {
        throw new IllegalStateException('Reader has an unexpected job privilege')
    }
}
if (!job.getACL().hasPermission2(authentication, Item.READ)) throw new IllegalStateException('Reader cannot read quality job')
// Returned secrets must be captured by the local provisioning client, never printed to chat.
println(JsonOutput.toJson([username: readerId, password: password, token: generated.plainValue,
                          authorization: matrix.class.name, preservedUsers: oldUsers.collect { it.id },
                          permissionsVerified: true]))
