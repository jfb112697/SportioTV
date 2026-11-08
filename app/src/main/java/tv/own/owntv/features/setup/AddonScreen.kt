package tv.own.owntv.features.setup

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.tv.material3.Text
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import org.koin.compose.koinInject
import tv.own.owntv.R
import tv.own.owntv.features.settings.SettingHelp
import tv.own.owntv.features.settings.SettingValue
import tv.own.owntv.features.settings.StageAction
import tv.own.owntv.features.settings.StageActionColumn
import tv.own.owntv.features.settings.StageFieldRow
import tv.own.owntv.features.settings.StageFullPage
import tv.own.owntv.features.settings.StageSettingRow
import tv.own.owntv.features.settings.StageSettingsHeading
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText
import java.text.DateFormat
import java.util.Date

/**
 * "Add source › Sports addon": point Sportio at a hosted **StreamFree addon** (this repo's `addon/`,
 * deployed on the LAN server) and add what it publishes as a playlist.
 *
 * Why it adds a playlist and not a fourth source type: the addon serves `/playlist.m3u` and
 * `/epg.xml`, so the fixtures arrive as ordinary channels with a guide, and the Sports Hub matches
 * them against ESPN exactly like any other playlist — no core change, no new sync path, and the
 * existing refresh/EPG machinery applies unchanged.
 */
@Composable
fun AddonScreen(
    onAdd: (name: String, playlistUrl: String, epgUrl: String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    initialUrl: String = "",
) {
    val client = AddonClient(koinInject<OkHttpClient>())
    val scope = rememberCoroutineScope()
    val rowsFocus = remember { FocusRequester() }
    val submitFocus = remember { FocusRequester() }

    var address by remember { mutableStateOf(initialUrl.ifBlank { DefaultAddonAddress }) }
    var state by remember { mutableStateOf<AddonUi>(AddonUi.Idle) }
    /**
     * The base URL that the current [state] verdict belongs to. Submit builds the playlist from
     * this, never from the live text field: editing the field after a successful check must not
     * produce a URL that was never checked (that is how `http` became `http://http/playlist.m3u`).
     */
    var checkedBase by remember { mutableStateOf("") }
    val ok = stringResource(R.string.common_ok)
    val back = stringResource(R.string.common_back)
    val parent = stringResource(R.string.setup_add_source)
    val defaultName = stringResource(R.string.addon_default_name)

    fun check(url: String) {
        if (state is AddonUi.Checking) return
        val base = client.normaliseBaseUrl(url)
        checkedBase = ""
        if (base.isEmpty()) {
            state = AddonUi.Failed(AddonClient.Failure.UNRESOLVED_HOST, 0)
            return
        }
        state = AddonUi.Checking
        scope.launch {
            state = runCatching { client.load(base) }
                .fold(
                    onSuccess = { checkedBase = base; AddonUi.Ready(it) },
                    onFailure = { error ->
                        val failure = (error as? AddonClient.AddonException)
                            ?: AddonClient.AddonException(AddonClient.Failure.UNREACHABLE)
                        AddonUi.Failed(failure.failure, failure.httpCode)
                    },
                )
        }
    }

    // Check the default address once on arrival, so the screen opens with a verdict instead of an
    // empty form the user has to discover the button for.
    LaunchedEffect(Unit) {
        runCatching { rowsFocus.requestFocus() }
        check(address)
    }

    val canAdd = state is AddonUi.Ready
    val submitLabel = stringResource(R.string.addon_add)
    val submitButton: @Composable () -> Unit = {
        if (canAdd) {
            StageActionColumn(
                listOf(
                    StageAction(OwnTVIcon.DOWNLOADS, submitLabel, {
                        val base = checkedBase.ifBlank { client.normaliseBaseUrl(address) }
                        val snapshot = (state as? AddonUi.Ready)?.snapshot
                        onAdd(
                            snapshot?.name?.takeIf { it.isNotBlank() } ?: defaultName,
                            client.playlistUrl(base),
                            client.epgUrl(base),
                        )
                    }),
                ),
                back = null,
                first = submitFocus,
            )
        }
    }
    StageFullPage(
        parents = listOf(parent),
        title = stringResource(R.string.addon_title),
        count = "",
        onBack = onBack,
        modifier = modifier,
        rowsFocus = rowsFocus,
        settingsRoot = false,
    ) {
        StageFieldRow(
            icon = OwnTVIcon.NETWORK,
            label = stringResource(R.string.addon_address),
            value = address,
            onValueChange = { address = it; state = AddonUi.Idle; checkedBase = "" },
            help = SettingHelp(
                stringResource(R.string.addon_address),
                stringResource(R.string.addon_help_address),
                hints = listOf(ok to stringResource(R.string.settings_key_open), back to parent),
                extra = submitButton,
            ),
            placeholder = DefaultAddonAddress,
            keyboardType = KeyboardType.Uri,
            backLabel = parent,
            submitHint = if (canAdd) "▶" to submitLabel else null,
            onDone = { check(address) },
        )

        val checkTitle = stringResource(R.string.addon_check)
        StageSettingRow(
            icon = OwnTVIcon.REFRESH,
            title = checkTitle,
            desc = when (val s = state) {
                AddonUi.Idle -> stringResource(R.string.addon_line_check)
                AddonUi.Checking -> stringResource(R.string.addon_checking)
                is AddonUi.Ready -> stringResource(R.string.addon_line_ready)
                is AddonUi.Failed -> stringResource(R.string.addon_line_failed)
            },
            value = when (val s = state) {
                is AddonUi.Ready -> SettingValue.Action(s.snapshot.version.ifBlank { ok })
                is AddonUi.Failed -> SettingValue.Action(stringResource(R.string.addon_status_failed))
                else -> SettingValue.Opens(null)
            },
            enabled = state !is AddonUi.Checking,
            onClick = { check(address) },
            help = SettingHelp(checkTitle, stringResource(R.string.addon_help_check), hints = listOf(ok to stringResource(R.string.settings_key_open), back to parent), extra = submitButton),
        )

        when (val s = state) {
            is AddonUi.Ready -> {
                StageSettingsHeading(stringResource(R.string.addon_live_now), s.snapshot.liveCount)
                if (s.snapshot.fixtures.isEmpty()) {
                    Text(
                        stringResource(R.string.addon_no_fixtures),
                        style = stageText(18, 500),
                        color = StageColors.Muted,
                        modifier = Modifier.padding(start = 22.mpx, top = 6.mpx),
                    )
                } else {
                    // Preview rows: the point of the screen is "is what I want on right now?", so the
                    // board is shown before anything is imported. They are read-only.
                    val preview = s.snapshot.fixtures.filter { it.live }.ifEmpty { s.snapshot.fixtures }
                    preview.take(PreviewRows).forEach { fixture ->
                        StageSettingRow(
                            icon = OwnTVIcon.SPORT,
                            title = fixture.name,
                            desc = listOfNotNull(
                                fixture.league.takeIf { it.isNotBlank() },
                                fixture.quality.takeIf { it.isNotBlank() },
                                kickoff(fixture.start),
                            ).joinToString(" · "),
                            value = if (fixture.live) SettingValue.Action(stringResource(R.string.addon_live)) else null,
                            onClick = {},
                            enabled = false,
                        )
                    }
                    if (preview.size > PreviewRows) {
                        val extra = preview.size - PreviewRows
                        StageSettingRow(
                            icon = OwnTVIcon.MORE,
                            title = pluralStringResource(R.plurals.addon_more, extra, extra),
                            desc = null,
                            value = null,
                            onClick = {},
                            enabled = false,
                        )
                    }
                }
            }
            is AddonUi.Failed -> {
                StageSettingsHeading(stringResource(R.string.addon_problem), null)
                Text(
                    addonFailureText(s),
                    style = stageText(16, 500),
                    color = StageColors.Muted,
                    modifier = Modifier.padding(start = 22.mpx, top = 6.mpx),
                )
            }
            else -> Unit
        }
    }
}

/** Screen state of the addon check. */
private sealed interface AddonUi {
    data object Idle : AddonUi
    data object Checking : AddonUi
    data class Ready(val snapshot: AddonClient.Snapshot) : AddonUi
    data class Failed(val failure: AddonClient.Failure, val httpCode: Int) : AddonUi
}

/** How many preview rows the screen shows before collapsing into "+N more". */
private const val PreviewRows = 8

/**
 * Where the addon normally lives: the LAN address of the machine running the compose stack.
 *
 * Deliberately an **IP, not `server.local`**: Android TV has no mDNS resolver for ordinary HTTP
 * clients, so a `.local` name fails there (after a slow lookup) even though it resolves on a desktop.
 * The field stays editable, and a different address can be typed over it.
 */
private const val DefaultAddonAddress = "http://192.168.1.71:7100"

/** `Today 20:30` / `Nov 8, 20:30` in the device's own zone. */
private fun kickoff(startSeconds: Long?): String {
    if (startSeconds == null || startSeconds <= 0) return ""
    val formatter = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)
    return formatter.format(Date(startSeconds * 1000))
}

/**
 * One sentence per failure kind. The distinctions matter on a TV where the address is typed with a
 * remote: "the name did not resolve" (a `.local` name, or a typo) is a different problem from "the
 * machine is not answering on that port", and neither is the same as "something else answered".
 */
@Composable
private fun addonFailureText(failed: AddonUi.Failed): String = when (failed.failure) {
    AddonClient.Failure.UNRESOLVED_HOST -> stringResource(R.string.addon_failed_host)
    AddonClient.Failure.UNREACHABLE -> stringResource(R.string.addon_failed_unreachable)
    AddonClient.Failure.NOT_AN_ADDON -> stringResource(R.string.addon_failed_not_addon)
    AddonClient.Failure.HTTP -> stringResource(R.string.addon_failed_http, failed.httpCode)
}
