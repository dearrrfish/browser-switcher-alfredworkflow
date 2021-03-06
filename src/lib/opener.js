
import Preview from './preview'
import Action from './action'
import {
    getDefaultBrowser, getBrowser, getApp, getAppData, openUrl, validateUrl, theClipboard
} from './utils'


class Opener extends Action {

    preview() {
        let preview = new Preview()
        let options = this.getQueryOptions()
        //let { dedupe } = this.getQueryFlags(true)

        let xml = this.previewOptionSelects(['browsers'], preview, options, ['in'])
        if (xml) { return xml }

        let _app, appName
        try {
            _app = getApp()
            let [ app, /*windows*/, browserType ] = _app
            appName = app.name()
            options.in = options.in || getBrowser(browserType, null, getDefaultBrowser())[0]
        }
        catch (err) {
            console.log(err)
            const opt = appName ? null : 'in'
            return this.previewOptionSelectsError(err, preview, opt)
        }

        const text = getAppData(appName, ['selection'], { source: _app }).selection || theClipboard()
        const urls = validateUrl(text, true)
        const [ inBrowser, inBrowserType ] = getBrowser(options.in)

        if (urls.length) {
            urls.forEach(url => {
                const query = this.constructQueryString({ notes: url })
                const item = {
                    arg: query,
                    //autocomplete: query,
                    title: url,
                    subtitle: `Open detected URL in ${inBrowser}`,
                    text_copy: `[](${url})`,
                    text_largetype: text,
                    icon: `browser_${inBrowserType}.png`,
                    icon_fileicon: `/Applications/${inBrowser}.app`
                }
                preview.add(item, 999)
            })
            return preview.buildXML()
        }
        else {
            const query = this.constructQueryString({
                flags: ['search'],
                notes: text
            })
            preview.add({
                arg: query,
                title: 'No valid URL was detected. Search instead?',
                subtitle: `Origin text: ${('' + text).replace(/\r?\n/g, ' ')}`,
                text_largetype: text
            })
        }

        return preview.buildXML()

    }

    run() {
        const { dedupe, search } = this.getQueryFlags(true)
        const options = this.getQueryOptions({ allowEmpty: false, sanitizer: true })

        let notes = this.getQueryNotes()
        notes = notes || getAppData(undefined, ['selection']).selection || theClipboard()

        let [ url, appName ] = openUrl(notes, options.in, { dedupe, fallbackSearch: search })

        if (url) {
            return `Opened URL in ${appName}: ${url}`
        }
        else {
            return `Search in ${appName}: ${notes}`
        }

    }

}


export default new Opener({
    name: 'open',
    title: 'Smart Opener',
    // opt: [ name, description, test, default, required, sanitizer, noset]
    opts: [
        ['in', 'Target browser to open URL(s) in', 1]
    ],
    // flag: [ name, description, test, default, noset]
    flags: [
        ['dedupe', 'Deduplicate URLs in target browser before open new tab', 1, true],
        ['search', 'Search text instead', 1, true]
    ]
})


