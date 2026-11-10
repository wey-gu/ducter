import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// One version for every part of Ducter (D148): packages/cli/package.json. `-PducterVersion=…`
// overrides it, for a local self-update trial only (design/release/android.md).
val pkgVersion: String = (JsonSlurper().parse(rootProject.file("../../packages/cli/package.json")) as Map<*, *>)["version"] as String
val ducterVersion: String = (findProperty("ducterVersion") as String?) ?: pkgVersion

/**
 * versionCode from the version (D181): ((major·1000 + minor)·1000 + patch)·100, plus the
 * pre-release number (beta.3 → 3, at most 98) or 99 for the release itself, so 0.2.0-beta.1 <
 * 0.2.0 < 0.2.1. Android refuses an update whose code isn't higher; this keeps that true for
 * every tag Ducter can cut. Same rule as Version.code in the app's tests.
 */
fun versionCodeOf(v: String): Int {
    val m = Regex("""^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]*?(\d+))?""").find(v) ?: error("not a version: $v")
    val (major, minor, patch) = m.destructured
    val pre = m.groupValues[4]
    val tail = if (v.contains('-')) (pre.toIntOrNull() ?: 0).coerceAtMost(98) else 99
    return ((major.toInt() * 1000 + minor.toInt()) * 1000 + patch.toInt()) * 100 + tail
}

// Release signing comes from the environment only: CI writes the keystore from secrets
// (release.yml's android job), a maintainer sets the same four on a machine of theirs.
val keystorePath: String? = System.getenv("DUCTER_ANDROID_KEYSTORE")?.takeIf { it.isNotBlank() }

android {
    namespace = "co.nowledge.ducter.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "co.nowledge.ducter.android"
        minSdk = 26
        targetSdk = 36
        versionName = ducterVersion
        versionCode = versionCodeOf(ducterVersion)
        // Where the app looks for a newer version of itself (D181). A debug build may point it
        // at a local fake release (`-PducterReleaseApi=http://10.0.2.2:7798/releases/latest`).
        buildConfigField("String", "RELEASE_API", "\"${(findProperty("ducterReleaseApi") as String?) ?: "https://api.github.com/repos/wey-gu/ducter/releases/latest"}\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("DUCTER_ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("DUCTER_ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("DUCTER_ANDROID_KEY_PASSWORD") ?: System.getenv("DUCTER_ANDROID_KEYSTORE_PASSWORD")
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        debug {
            // A development build sits beside the released app, never over it.
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
        }
        release {
            // No shrinking: the shell is small, and R8 would have to be told about the bridge.
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// A release APK signed with nothing (or, worse, the debug key) installs nowhere useful and can
// never be updated by the real one: refuse to build it (research/51 §2).
gradle.taskGraph.whenReady {
    if (allTasks.any { it.name in setOf("assembleRelease", "packageRelease") } && keystorePath == null) {
        throw GradleException("Release builds need DUCTER_ANDROID_KEYSTORE (+ _KEYSTORE_PASSWORD, _KEY_ALIAS, _KEY_PASSWORD); see design/release/android.md")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.window:window:1.4.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    testImplementation("junit:junit:4.13.2")
    // A real org.json on the JVM (Android's is stubs there), for the release parsing tests.
    testImplementation("org.json:json:20240303")
}
