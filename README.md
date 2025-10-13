---
title: README
---

# Vision/Goal Document

This tool was inspired by my repeated use of this mpv / bash CLI command:

```
$              command mpv --vo=null --no-audio-display --load-unsafe-playlists --ytdl-format=worst http://someexample.org/somePlaylist.pls
$ : or just: ; command mpv --no-audio-display --load-unsafe-playlists https://someexample.org/somePlaylist.pls
```

The above works reliably to play long playlists. I have been using the syntax for years. I wanted to provide a way for non power users to paly log playlists using a web tool.

# Functional Specification | INCOMPLETE/FIXME

## The end user should be able to click on an "about" button to get the git branch and tag value. 

Perhaps for example | https://g.co/gemini/share/184fd6a84c27 :

```
// app-config.json
{
  "apiEndpoint": "https://api.example.com",
  "versionInfo": {
    "branch": "GIT_BRANCH_PLACEHOLDER",
    "tag": "GIT_TAG_PLACEHOLDER"
  }
}
```

I'm not sure what the value of "apiEndpoint" is, or if it is needed.



## Implement the "--load-unsafe-playlists" feature supported by mpv.

## Fail gracefully, if there is a problem playing a single selection, allow the user to skip backwords or to the next selection.

# Design Document

## end user text field input

* TODO: trim off leading and trailing whitespace

---

## Project Structure

This project is small but intends to use a clear separation of concerns for easy maintenance.

| File/Directory | Purpose |
| :--- | :--- |
| **`./plar.html`** | End user landing/bootstrap/init page | 
| **`./js/plsPlayer.js`** | The primary application entry point and logic for rendering the UI. |
| **`./js/config/plar.json`** | Set default playlist URL to load if user supplies noting to play. |
| **`./README.md`** | You are here! The main documentation and entry point for new users/developers. |
| NOT-STARTED: **`changelog`** | I'm using the [whois](https://github.com/rfc1036/whois/blob/next/debian/changelog) changelog as template |
| NOT-STARTED: **`app-config.json`** | **Configuration file** for application settings (like API endpoints) and version data injected during the build. |

It may make sense to move any settings that were planned to go in app-config.json into ./js/config/plar.json.

## Access via github

### main branch
