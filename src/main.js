
const ACTION_SHORTS = {
    sw: 'switch',
    cp: 'copy',
    op: 'open',
    ss: 'stash'
}

const SAFARI_LIST = ['Safari', 'Webkit']
const CHROME_LIST = ['Google Chrome', 'Google Chrome Canary', 'Chromium']

// `run` applet
function run(argv) {
    argv = argv.join(' ')
    const actions = parseArgv(argv)

    console.log (JSON.stringify(actions))
    const resp = {success: [], error: null}
    actions.some(({ name, options }) => {
        let r = {}
        switch (name) {
            case 'switch': r = browserSwitch(options); break
            case 'copy': r = copyData(options); break
            case 'open': r = openLink(options); break
            // case 'stash': break;
            default: r.error = `Unknown action - [${name}]`
        }

        if (r.error) { resp.error = r.error; return true }
        else { resp.success.push(r.success); return false }
    })

    return resp.error || resp.success.join('\n')
}


function browserSwitch({clone, dedupe, reverse}) {
    const resp = {
        from: null,
        to: null,
        url: null,
        title: null,
        success: null,
        error: null,
        options: [clone, dedupe, reverse]
    }

    let frontApp = frontmostApp()
    let targetApp = null
    if (SAFARI_LIST.indexOf(frontApp) !== -1) {
        targetApp = 'Google Chrome'
    } else if (CHROME_LIST.indexOf(frontApp) !== -1) {
        targetApp = 'Safari'
    } else {
        return 'Frontmost application is not in list of supported browsers.'
    }

    if (reverse) { [frontApp, targetApp] = [targetApp, frontApp] }
    Object.assign(resp, { from: frontApp, to: targetApp })

    let {url, title, error} = getAppData(frontApp)
    Object.assign(resp, { url: url, title: title, error: error })
    if (error) { resp.error = error; return resp }

    url = validateUrl(url)
    if (!url) { resp.error = 'No valid url was detected.'; return resp }

    if (!clone) { error = closeCurrentTab(frontApp) }
    if (error) { resp.error = error; return resp }

    error = openUrl(url, targetApp, { dedupe: dedupe })
    if (error) { resp.error = error; return resp }

    resp.success = `${resp.from} -> ${resp.to}:\n<<${resp.title}>>`
    return resp
}


function copyData({clips = new Set(['url'])} = {}) {
    const resp = {
        copied: null,
        success: null,
        error: null
    }

    const frontApp = frontmostApp()
    const data = getAppData(frontApp, { selection: clips.has('selection') })
    if (data.error) { resp.error = data.error; return resp }

    clips = Array.from(clips)
    const copied = clips.map(type => data[type] || '').join('\n')
    theClipboard(copied)

    Object.assign(resp, {
        copied: copied,
        success: `Copied [${clips.toString()}] to clipboard from ${frontApp}.`
    })

    return resp
}


function openLink({ dedupe }) {
    const resp = {
        url: null,
        success: null,
        error: null
    }

    const frontApp = frontmostApp()
    const text = getAppData(frontApp, { selection: true }).selection || theClipboard()

    let url = validateUrl(text, true)
    if (!url) { resp.error = 'No valid url was detected.'; return resp }

    let error = openUrl(url, frontApp, { dedupe: dedupe })
    if (error) { resp.error = error; return resp }

    Object.assign(resp, {
        url: url,
        success: `Opened link: ${url}`
    })
    return resp
}

// ================================================================================================

// argv {string}
function parseArgv(argv = '', delimiter = '&') {
    //console.log(argv, delimiter)
    const qs = argv.split(delimiter)
    const actions = qs.map(q => {
        q = q.trim();
        const params = q.split(/\s+/)
        const action = parseAction(...params)
        return action
    });

    return actions
}


function parseAction (name = 'switch', ...params) {
    name = name.toLowerCase()
    if (ACTION_SHORTS.hasOwnProperty(name)) { name = ACTION_SHORTS[name] }

    const options = {
        // swtich tab & open url related
        clone: false,       // do not close original tab in front browser
        dedupe: false,      // do not duplicate open new tab if exists in target browser
        reverse: false,     // reverse flow from target to front
        // copy tab information related
        clips: new Set(['url', 'title', 'selection'])
    }

    const flags = new Set()
    const clips = new Set()
    params.forEach(p => {
        if      (/^c(lone)*$/i.test(p))   { flags.add('clone') }
        else if (/^de?d(upe)*$/i.test(p)) { flags.add('dedupe') }
        else if (/^re(verse)*$/i.test(p)) { flags.add('reverse') }

        else if (/^url$/i.test(p))        { clips.add('url') }
        else if (/^title$/i.test(p))      { clips.add('title') }
        else if (/^selection$/i.test(p))   { clips.add('selection') }

    });

    flags.forEach(f => options[f] = true);
    if (clips.size) { options.clips = clips }

    return { name, options }
}


function frontmostApp() {
    const SystemEvents = Application('System Events')
    const appName = SystemEvents.processes.whose({ frontmost: true })[0].name()
    return appName
}


function getApp(appName, activate = false) {
    const app = Application(appName)
    app.includeStandardAdditions = true
    if (activate) { app.activate() } else { app.launch() }
    return app
}

function getDefaultBrowser() {
    const app = Application.currentApplication()
    app.includeStandardAdditions = true
    const defaultBrowser = app.doShellScript(
        "export VERSIONER_PERL_PREFER_32_BIT=yes; perl -MMac::InternetConfig -le 'print +(GetICHelper \"http\")[1]'"
    )
    return defaultBrowser
}

function theClipboard(sth) {
    const SystemEvents = Application('System Events')
    SystemEvents.includeStandardAdditions = true
    if (sth) { SystemEvents.setTheClipboardTo(sth) }
    return SystemEvents.theClipboard()
}

function keystroke(key, modifiers = []) {
    const SystemEvents = Application('System Events')
    const using = modifiers.map(modifier => `${modifier} down`)
    console.log ('keystroke: ', key, using)
    if (using.length === 0) {
        SystemEvents.keystroke(key)
    }
    else {
        SystemEvents.keystroke(key, { using: using })
    }
}


function getAppData(appName = frontmostApp(), {selection = false} = {}) {
    const data = {
        url: null,
        title: null,
        selection: null,
        error: null
    }

    let app = null
    try { app = Application(appName) }
    catch (err) { data.error = `No such application - ${appName}`; return data }

    if (SAFARI_LIST.indexOf(appName) !== -1) {
        try {
            const currentTab = app.windows[0].currentTab()
            data.url = currentTab.url()
            data.title = currentTab.name()

            if (selection) {
                // do javascript trick to get selection text in Safari tab
                data.selection = app.doJavaScript("('' + getSelection())", { in: currentTab })
            }

        }
        catch (err) { data.error = err }
    }
    else if (CHROME_LIST.indexOf(appName) !== -1) {
        try {
            const activeTab = app.windows[0].activeTab()
            data.url = activeTab.url()
            data.title = activeTab.title()

            if (selection) {
                // Chrome has `copySelection` method of tab
                const clipboardBackup = theClipboard()
                activeTab.copySelection()
                delay(0.1)
                data.selection = theClipboard()
                theClipboard(clipboardBackup)
            }

        }
        catch (err) { data.error = err }
    }
    else {
        try {
            data.title = (app.windows[0] && app.windows[0].name()) || app.name()

            if (selection) {
                // call keystroke `cmd + c` to copy text
                const clipboardBackup = theClipboard()
                keystroke('c', ['command'])
                delay(0.1)
                data.selection = theClipboard()
                //delay(0.1)
                theClipboard(clipboardBackup)
            }
        }
        catch (err) { data.error = err }
    }

    return data
}


function closeCurrentTab(appName = frontmostApp()) {
    let app = null
    try { app = Application(appName) }
    catch (err) { data.error = `No such application - ${appName}`; return data }

    try {
        const win = app.windows[0]
        if (SAFARI_LIST.indexOf(appName) !== -1) { app.close(win.currentTab()) }
        else if (CHROME_LIST.indexOf(appName) !== -1) { app.close(win.activeTab()) }
        //const tab = (win.currentTab && win.currentTab()) ||
                    //(win.activeTab && win.activeTab())
        //app.close(tab)
    }
    catch (err) {
        return `No tabs of current window of application - ${appName}`
    }

    return null
}


function openUrl(url, target, { activate = true, dedupe = false, newTab = true, background = false } = {}) {
    let app = null

    if (SAFARI_LIST.concat(CHROME_LIST).indexOf(target) === -1) {
        target = getDefaultBrowser()
    }

    try { app = getApp(target, activate) }
    catch (err) {
        app = Application.currentApplication()
        app.includeStandardAdditions = true
        app.openLocation(url)
        return null
    }

    const windows = app.windows()

    let exists = false
    if (dedupe) {
        windows.some((win) => {
            let tabs = null
            try { tabs = win.tabs() } catch (err) { return exists }

            tabs.some((tab, i) => {
                // TODO more wise url match method
                if (tab.url() == url) {
                    exists = [win, tab, i + 1]
                    return true
                }

                return exists   // false
            })

            return exists   // false
        })

    }

    // open in front window by default
    exists = exists || [windows[0]]
    let [win, tab, tabIndex] = exists

    if (!tab) {
        if (newTab || !win.tabs().length ) {
            tab = app.Tab({ url: url })
            tabIndex = win.tabs.push(tab)
        }
        else {
            tab = win.currentTab || win.activeTab
            tab && (tab.url = url)
        }
    }

    if (!tab) { return 'browser not supported' }

    if (!background) {
        if (SAFARI_LIST.indexOf(target) !== -1) { win.currentTab = tab }
        else if (CHROME_LIST.indexOf(target) !== -1 && tabIndex) { win.activeTabIndex = tabIndex }
    }

    // always bring window to front within app
    win.index = 1

    return null
}


// http://forums.devshed.com/javascript-development-115/regexp-to-match-url-pattern-493764.html
// https://github.com/ttscoff/popclipextensions/blob/master/OpenURLS.popclipext/openurls.rb
function validateUrl(str, debug) {
    if (typeof str === 'string') {
        const re = new RegExp(
            '(?:(?:https?:\\/\\/))?' + // protocol
            '(localhost|' + // local host
            '(([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
            '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
            '(:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
            '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
            '(\\#[-a-z\\d_]*)?' // fragment locater
            , 'i')

        const match = re.exec(str)
        if (debug) { console.log(match) }
        if (match && typeof match[0] === 'string') {
            return match[0]
        }
    }
    return null
}

