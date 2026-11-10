// The Ducter Android app (D178): a thin native shell around the phone client the home serves at
// /app, like apps/ios. Build and release: design/release/android.md.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "Ducter"
include(":app")
