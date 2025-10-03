// plsPlayer.js
class PLSPlayer {
    static version = "1.0.77"; // Updated to Version 1.0.77

    constructor(containerId, playlistUrl = '', playerBaseUrl = '', defaultUrl = '', configUrl = '') {
        console.log('PLSPlayer constructor called with containerId:', containerId, 'playlistUrl:', playlistUrl, 'playerBaseUrl:', playerBaseUrl, 'defaultUrl:', defaultUrl, 'configUrl:', configUrl);
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container with ID ${containerId} not found`);
            throw new Error(`Container with ID ${containerId} not found`);
        }
        this.container.style.display = 'block';
        this.container.style.visibility = 'visible';
        this.tracks = [];
        this.currentIndex = 0;
        this.currentEnd = Infinity;
        this.playbackRate = 1.0;
        this.isSingleAudio = false;
        this.playerState = 'unloaded';
        this.speedMode = 'normal';
        this.maxSpeed = 16.0;
        this.segmentEnded = false;
        this.errorShownForUrl = null;
        this.lastErrorTimestamp = 0;
        this.errorDebounceMs = 1000;
        this.playerBaseUrl = playerBaseUrl || `http://${window.location.host}/plar.html?audio=`; // Default to http
        this.defaultUrl = defaultUrl; // Store constructor defaultUrl
        this.configUrl = configUrl; // Store config file URL
        this.playlistLastModified = 'Unknown'; // Playlist modification timestamp

        this.setupUI();

        this.audio = this.container.querySelector('#player');
        this.playPauseBtn = this.container.querySelector('#playpause');
        this.prevBtn = this.container.querySelector('#prev');
        this.nextBtn = this.container.querySelector('#next');
        this.speedSpan = this.container.querySelector('#speed');
        this.metadataDiv = this.container.querySelector('#metadata');
        this.plsUrlInput = this.container.querySelector('#pls-url');
        this.statusDiv = this.container.querySelector('#status');
        this.currentTimeSpan = this.container.querySelector('#current-time');
        this.speedUpBtn = this.container.querySelector('#speed-up');
        this.speedDownBtn = this.container.querySelector('#speed-down');
        this.shareUrlDiv = this.container.querySelector('#share-url');
        this.playlistWindow = this.container.querySelector('#playlist-window');

        this.updatePlayButton();
        this.updateNavButtons();
        this.updateSpeedButtons();
        this.updatePlaylistWindow();

        const rawQuery = window.location.search;
        const rawHash = window.location.hash;
        let audioUrl = null;
        let playlistUrlFromParams = null;
        const audioMatch = rawQuery.match(/[?&]audio=([^&]*)/);
        const playlistMatch = rawQuery.match(/[?&]playlist=([^&]*)/);

        const loadUrl = async () => {
            let urlToLoad = null;
            let isSingleAudio = false;

            if (audioMatch) {
                audioUrl = decodeURIComponent(audioMatch[1]).replace(/%23/g, '#');
                if (rawHash && (rawHash.includes('t=') || rawHash.includes('?t='))) {
                    audioUrl += rawHash;
                }
                console.log('Constructor: audioUrl=', audioUrl);
                urlToLoad = audioUrl;
                isSingleAudio = true;
            } else if (playlistMatch) {
                playlistUrlFromParams = decodeURIComponent(playlistMatch[1]);
                console.log('Constructor: playlistUrl=', playlistUrlFromParams);
                urlToLoad = playlistUrlFromParams;
                isSingleAudio = false;
            } else if (playlistUrl) {
                console.log('Constructor: fallback playlistUrl=', playlistUrl);
                urlToLoad = playlistUrl;
                isSingleAudio = false;
            } else if (this.defaultUrl) {
                console.log('Constructor: using defaultUrl=', this.defaultUrl);
                urlToLoad = this.defaultUrl;
                const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg'];
                const playlistExtensions = ['.pls', '.m3u'];
                isSingleAudio = audioExtensions.some(ext => this.defaultUrl.toLowerCase().includes(ext)) &&
                                !playlistExtensions.some(ext => this.defaultUrl.toLowerCase().endsWith(ext));
            } else if (this.configUrl) {
                console.log('Constructor: fetching configUrl=', this.configUrl);
                try {
                    const response = await fetch(this.configUrl, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    if (!response.ok) {
                        throw new Error(`Failed to fetch config file: ${response.status} ${response.statusText}`);
                    }
                    const config = await response.json();
                    console.log('Constructor: config fetched=', config);
                    if (config.defaultUrl && typeof config.defaultUrl === 'string' && this.isValidUrl(config.defaultUrl)) {
                        console.log('Constructor: config defaultUrl=', config.defaultUrl);
                        urlToLoad = config.defaultUrl;
                        const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg'];
                        const playlistExtensions = ['.pls', '.m3u'];
                        isSingleAudio = audioExtensions.some(ext => config.defaultUrl.toLowerCase().includes(ext)) &&
                                        !playlistExtensions.some(ext => this.defaultUrl.toLowerCase().endsWith(ext));
                    } else {
                        console.warn('Constructor: invalid or missing defaultUrl in config file, config=', config);
                        this.showErrorAlert('Invalid or missing defaultUrl in config file.', this.configUrl);
                    }
                } catch (error) {
                    console.error('Constructor: failed to load config file, error=', error);
                    this.showErrorAlert(`Failed to load config file: ${error.message}. Ensure the config URL is accessible and contains a valid defaultUrl.`, this.configUrl);
                }
            }

            if (urlToLoad) {
                console.log('Constructor: setting plsUrlInput.value=', urlToLoad, 'isSingleAudio=', isSingleAudio);
                this.plsUrlInput.value = urlToLoad;
                this.isSingleAudio = isSingleAudio;
                if (isSingleAudio) {
                    console.log('Constructor: loading single audio');
                    await this.loadSingleAudio(true);
                } else {
                    console.log('Constructor: loading playlist');
                    await this.loadPlaylist(true);
                }
            } else {
                console.log('Constructor: no URL to load');
                this.statusDiv.textContent = 'No URL provided. Enter a playlist or audio URL and click Load.';
            }

            this.setupEventListeners();
        };

        loadUrl();
    }

    isValidUrl(url) {
        const urlPattern = /^(https?:\/\/)[\w\-]+(\.[\w\-]+)+[/#?]?.*$/;
        const isValid = urlPattern.test(url);
        console.log('isValidUrl: url=', url, 'isValid=', isValid);
        return isValid;
    }

    showErrorAlert(message, url) {
        const now = Date.now();
        if (this.errorShownForUrl !== url || now - this.lastErrorTimestamp > this.errorDebounceMs) {
            alert(message);
            this.errorShownForUrl = url;
            this.lastErrorTimestamp = now;
        }
    }

    updatePlaylistWindow() {
        if (!this.playlistWindow) {
            console.error('Playlist window element not found');
            return;
        }
        if (this.isSingleAudio || this.tracks.length <= 1) {
            this.playlistWindow.style.display = 'none';
            this.playlistWindow.innerHTML = '';
            return;
        }

        this.playlistWindow.style.display = 'block';
        let startIndex;
        const maxRows = 10;

        if (this.currentIndex < 3) {
            startIndex = 0;
        } else if (this.currentIndex >= this.tracks.length - 7 && this.tracks.length > maxRows) {
            startIndex = this.tracks.length - maxRows;
        } else {
            startIndex = this.currentIndex - 3;
        }

        const endIndex = Math.min(startIndex + maxRows, this.tracks.length);
        let html = `<div style="font-size: 14px; padding: 10px; border: 1px solid #ccc;">`;
        html += `<div style="font-weight: bold; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Playlist (${this.tracks.length} tracks, Last Modified: ${this.playlistLastModified}${this.playlistLastModified !== 'Unknown' ? ' GMT' : ''})</div>`;
        html += `<div style="max-height: 200px; overflow-y: auto;">`;
        for (let i = startIndex; i < endIndex; i++) {
            const trackNumber = i + 1; // Use absolute track number (1-based index)
            const track = this.tracks[i];
            const isCurrent = i === this.currentIndex;
            const style = isCurrent ? 'font-weight: bold; background-color: #e0e0e0; cursor: pointer;' : 'cursor: pointer;';
            html += `<div style="${style}" data-index="${i}">${trackNumber}. ${track.url}</div>`;
        }
        html += '</div></div>';
        this.playlistWindow.innerHTML = html;

        const trackRows = this.playlistWindow.querySelectorAll('div[data-index]');
        trackRows.forEach(row => {
            row.addEventListener('click', () => {
                const index = parseInt(row.getAttribute('data-index'), 10);
                console.log(`Playlist row clicked: index=${index}, url=${this.tracks[index].url}`);
                this.clearShareUrl();
                this.segmentEnded = false;
                this.playTrack(index);
            });
        });

        console.log('updatePlaylistWindow: startIndex=', startIndex, 'currentIndex=', this.currentIndex);
    }

    setupUI() {
        this.container.innerHTML = `
            <div style="margin-bottom: 10px;">
                <input id="pls-url" type="text" placeholder="Enter PLS or audio URL (e.g., http://example.com/song.mp3#t=00:00:10)" style="width: 70%; max-width: 800px; font-size: 16px; padding: 8px; box-sizing: border-box;">
                <button id="load-playlist" style="font-size: 16px; padding: 10px 20px;">Load</button>
                <button id="clear-url" style="font-size: 16px; padding: 10px 20px;">Clear</button>
                <button id="about" style="font-size: 16px; padding: 10px 20px;">About</button>
                <button id="help" style="font-size: 16px; padding: 10px 20px;">Help</button>
                <button id="speed-mode" style="font-size: 16px; padding: 10px 20px;">2x Mode</button>
            </div>
            <audio id="player"></audio>
            <div id="controls" style="margin-top: 10px;">
                <button id="prev" aria-disabled="true" style="font-size: 16px; padding: 10px 20px;">Previous</button>
                <button id="playpause" aria-disabled="true" style="font-size: 20.8px; padding: 13px 26px;">Play</button>
                <button id="next" aria-disabled="true" style="font-size: 16px; padding: 10px 20px;">Next</button>
                <button id="speed-up" style="font-size: 16px; padding: 10px 20px;">Speed +</button>
                <button id="speed-down" style="font-size: 16px; padding: 10px 20px;">Speed -</button>
                <span>Speed: <span id="speed">1.00</span>x</span>
                <span style="margin-left: 20px;">Current Time: <span id="current-time" style="font-size: 20px; color: #28a745; font-weight: bold;">00:00:00</span></span>
            </div>
            <div id="metadata" style="margin-top: 10px; padding: 10px; border: 1px solid #ccc;">
                Metadata will appear here.
            </div>
            <div id="status" style="margin-top: 10px;"></div>
            <div id="share-url" style="margin-top: 10px;"></div>
            <div id="playlist-window" style="margin-top: 10px;"></div>
            <div id="footer" style="margin-top: 10px; font-size: 14px; color: #333;">
                <p>If the player isn't working, try these steps: 1) Use a modern browser like Google Chrome, Mozilla Firefox, Microsoft Edge, or Apple Safari (update your browser if it's old). 2) Ensure the URL starts with http:// or https:// and points to a valid audio file (like .mp3) or playlist (.pls). 3) If you see an error about "HTTP" and "HTTPS," visit the player at an address starting with http:// (not https://) or use an audio link starting with https://. 4) Check your internet connection. 5) For help, contact the website owner or try a different audio file.</p>
            </div>
            <style>
                @media screen and (max-width: 600px) {
                    #pls-url {
                        width: 90% !important;
                    }
                    #current-time {
                        font-size: 18px !important; // Smaller font for mobile
                    }
                }
            </style>
        `;
    }

    updatePlayButton() {
        if (this.playerState === 'loaded') {
            this.playPauseBtn.style.backgroundColor = '#28a745';
            this.playPauseBtn.style.color = '#ffffff';
            this.playPauseBtn.removeAttribute('aria-disabled');
            this.playPauseBtn.disabled = false;
        } else {
            this.playPauseBtn.style.backgroundColor = '#6c757d';
            this.playPauseBtn.style.color = '#ffffff';
            this.playPauseBtn.setAttribute('aria-disabled', 'true');
            this.playPauseBtn.disabled = true;
        }
        console.log('updatePlayButton: playerState=', this.playerState);
    }

    updateNavButtons() {
        const isPlaylist = !this.isSingleAudio && this.tracks.length > 1;
        const canGoPrev = isPlaylist && this.currentIndex > 0;
        const canGoNext = isPlaylist && this.currentIndex < this.tracks.length - 1;

        this.prevBtn.style.display = isPlaylist ? 'inline-block' : 'none';
        this.nextBtn.style.display = isPlaylist ? 'inline-block' : 'none';

        if (canGoPrev) {
            this.prevBtn.style.backgroundColor = '#007bff';
            this.prevBtn.style.color = '#ffffff';
            this.prevBtn.removeAttribute('aria-disabled');
            this.prevBtn.disabled = false;
        } else {
            this.prevBtn.style.backgroundColor = '#6c757d';
            this.prevBtn.style.color = '#ffffff';
            this.prevBtn.setAttribute('aria-disabled', 'true');
            this.prevBtn.disabled = true;
        }

        if (canGoNext) {
            this.nextBtn.style.backgroundColor = '#007bff';
            this.nextBtn.style.color = '#ffffff';
            this.nextBtn.removeAttribute('aria-disabled');
            this.nextBtn.disabled = false;
        } else {
            this.nextBtn.style.backgroundColor = '#6c757d';
            this.nextBtn.style.color = '#ffffff';
            this.nextBtn.setAttribute('aria-disabled', 'true');
            this.nextBtn.disabled = true;
        }

        console.log('updateNavButtons: isPlaylist=', isPlaylist, 'canGoPrev=', canGoPrev, 'canGoNext=', canGoNext);
    }

    updateSpeedButtons() {
        if (this.speedMode === '2x' && this.playbackRate >= this.maxSpeed) {
            this.speedUpBtn.style.backgroundColor = '#6c757d';
            this.speedUpBtn.style.color = '#ffffff';
            this.speedUpBtn.setAttribute('aria-disabled', 'true');
            this.speedUpBtn.disabled = true;
        } else {
            this.speedUpBtn.style.backgroundColor = '';
            this.speedUpBtn.style.color = '';
            this.speedUpBtn.removeAttribute('aria-disabled');
            this.speedUpBtn.disabled = false;
        }
        this.speedDownBtn.style.backgroundColor = '';
        this.speedDownBtn.style.color = '';
        this.speedDownBtn.removeAttribute('aria-disabled');
        this.speedDownBtn.disabled = false;
    }

    clearShareUrl() {
        if (this.shareUrlDiv) {
            this.shareUrlDiv.innerHTML = '';
        }
    }

    getHttpPlayerUrl() {
        const baseUrl = this.playerBaseUrl || `${window.location.host}/plar.html?audio=`;
        return `http://${baseUrl.replace(/^https?:\/\//, '')}`;
    }

    clearUrlInput() {
        console.log('clearUrlInput: clearing URL input and resetting player');
        // Reset error tracking to prevent stale error alerts
        this.errorShownForUrl = null;
        this.lastErrorTimestamp = 0;
        // Pause audio and remove src to reset the audio element
        this.audio.pause();
        // Temporarily store and remove any existing error listener to prevent erroneous alerts
        const existingErrorListener = this.audio.errorHandler; // Store if set in loadSingleAudio/prepareTrack
        if (existingErrorListener) {
            this.audio.removeEventListener('error', existingErrorListener);
        }
        // Safely reset audio source
        this.audio.removeAttribute('src');
        this.audio.load(); // Reset the audio element's state
        // Reattach error listener if it existed
        if (existingErrorListener) {
            this.audio.errorHandler = existingErrorListener;
            this.audio.addEventListener('error', existingErrorListener);
        }
        // Reset player state and UI
        this.plsUrlInput.value = '';
        this.tracks = [];
        this.currentIndex = 0;
        this.currentEnd = Infinity;
        this.playPauseBtn.textContent = 'Play';
        this.playerState = 'unloaded';
        this.segmentEnded = false;
        this.statusDiv.textContent = '';
        this.metadataDiv.innerHTML = 'Metadata will appear here.';
        this.clearShareUrl();
        this.updatePlayButton();
        this.updateNavButtons();
        this.updatePlaylistWindow();
        this.plsUrlInput.focus();
        this.playlistLastModified = 'Unknown'; // Reset playlist timestamp
    }

    setupEventListeners() {
        const aboutBtn = this.container.querySelector('#about');
        if (aboutBtn) {
            aboutBtn.addEventListener('click', () => {
                this.clearShareUrl();
                alert(`PLS Playlist or Audio Player v${PLSPlayer.version}\nToday's date: September 28, 2025, 01:53 PM CDT\n\nA simple audio player for PLS playlists or single audio files. Supports MP3/MP4 with play/pause, next/prev, speed controls, and segment playback via #t=start,end or #t=HH:MM:SS,HH:MM:SS. Use arrow keys for navigation and 'SPACE', 's', 'e', 'b', 'n', 'p', 'P', 'j', 'J', 'c' keys for pause/play, segment, sharing, playlist control, and clearing the URL. After a segment ends, click Play or press SPACE to continue past the segment. Warning: HTTP audio URLs may not play on HTTPS pages due to browser security. Load the player over HTTP (e.g., ${this.getHttpPlayerUrl()}) for HTTP audio.`);
            });
        } else {
            console.error('About button not found');
        }

        const helpBtn = this.container.querySelector('#help');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                this.clearShareUrl();
                alert(`Enter a PLS playlist or audio URL, or use ?playlist=URL or ?audio=URL to pre-load. A default playlist may load from a config file if provided. Click "Load" to apply changes or "Clear" (or press 'c' when not typing in the URL field) to reset the URL input. Supports MP3/MP4 with play/pause, next/prev, speed controls, and #t=start,end or #t=HH:MM:SS,HH:MM:SS or #t=START segments. Arrow keys: Left/Right (±10s, backward/forward), Up/Down (±60s, forward/backward), Shift+Up/Down (±10min, forward/backward). Keys: 'SPACE' (toggle pause/play when not typing in the URL field), 's' (to segment start), 'e' (to segment end), 'b' (to beginning), 'n' (to end), 'p' (when paused, generate shareable URL with player base URL and current timestamp or original segment in HH:MM:SS format), 'P' (when paused, copy original media URL with current timestamp in HH:MM:SS format), 'j' (prompt for HH:MM:SS timestamp to jump to), 'J' (prompt for playlist row number to jump to), 'c' (clear the URL input and focus it, when not typing in the URL field). After a segment ends, click Play or press SPACE to continue past the segment. When playing a playlist, a window shows up to 10 tracks (with total track count and Last Modified timestamp from the server in GMT or Unknown if unavailable in the header), with row numbers matching track numbers in the entire playlist and the current track highlighted (in row 4 when possible). Click a track in the playlist to play it. The Last Modified timestamp helps identify fresh or stale playlists.${this.playerBaseUrl ? ' Shareable URLs include the player URL.' : ''}${this.defaultUrl || this.configUrl ? ' A default playlist or audio may load if no URL is provided.' : ''} Warning: HTTP audio URLs may not play on HTTPS pages. Load the player over HTTP (e.g., ${this.getHttpPlayerUrl()}) for HTTP audio.`);
            });
        } else {
            console.error('Help button not found');
        }

        const clearUrlBtn = this.container.querySelector('#clear-url');
        if (clearUrlBtn) {
            clearUrlBtn.addEventListener('click', () => {
                this.clearUrlInput();
                console.log('Clear button clicked');
            });
        } else {
            console.error('Clear button not found');
        }

        const speedModeBtn = this.container.querySelector('#speed-mode');
        if (speedModeBtn) {
            speedModeBtn.addEventListener('click', () => {
                this.clearShareUrl();
                this.speedMode = this.speedMode === 'normal' ? '2x' : 'normal';
                if (this.speedMode === 'normal') {
                    this.playbackRate = 1.0;
                    this.audio.playbackRate = this.playbackRate;
                    this.speedSpan.textContent = this.playbackRate.toFixed(2);
                }
                speedModeBtn.textContent = this.speedMode === 'normal' ? '2x Mode' : 'Normal Mode';
                this.updateSpeedButtons();
                console.log('speedMode toggled to:', this.speedMode, 'playbackRate=', this.playbackRate);
            });
        } else {
            console.error('Speed Mode button not found');
        }

        this.plsUrlInput.addEventListener('input', (event) => {
            this.clearShareUrl();
            const currentValue = event.target.value;
            if (currentValue === 'h' && event.inputType === 'insertText' && this.plsUrlInput.dataset.previousValue === '') {
                this.plsUrlInput.value = 'http://';
                this.plsUrlInput.setSelectionRange(7, 7);
                console.log('Autocomplete triggered: set to http://');
            }
            this.errorShownForUrl = null;
            this.plsUrlInput.dataset.previousValue = currentValue;
        });

        this.plsUrlInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.clearShareUrl();
                this.errorShownForUrl = null;
                this.lastErrorTimestamp = 0;
                this.container.querySelector('#load-playlist').click();
            }
            this.plsUrlInput.dataset.previousValue = this.plsUrlInput.value;
        });

        this.audio.addEventListener('timeupdate', () => {
            this.currentTimeSpan.textContent = this.formatTime(this.audio.currentTime);
            if (this.audio.currentTime >= this.currentEnd - 0.5 && !this.audio.paused && !this.segmentEnded) {
                console.log(`timeupdate: segment ended, pausing at currentTime=${this.audio.currentTime}, currentEnd=${this.currentEnd}`);
                this.audio.pause();
                this.playPauseBtn.textContent = 'Play';
                this.playerState = 'loaded';
                this.segmentEnded = true;
                this.updatePlayButton();
                if (this.isSingleAudio || this.tracks.length === 1) {
                    this.statusDiv.textContent = 'Segment ended. Click Play or press SPACE to continue past the segment or restart.';
                } else {
                    this.playTrack(this.currentIndex + 1);
                }
            }
        });

        this.playPauseBtn.addEventListener('click', () => {
            this.clearShareUrl();
            if (this.playerState !== 'loaded') {
                console.log('playPauseBtn: click ignored, playerState=', this.playerState);
                return;
            }
            if (this.audio.paused) {
                if (this.segmentEnded) {
                    this.currentEnd = isNaN(this.audio.duration) ? Infinity : this.audio.duration;
                    this.segmentEnded = false;
                    this.updateMetadata();
                    console.log('playPauseBtn: continuing past segment end, new currentEnd=', this.currentEnd);
                }
                this.audio.play().catch(error => {
                    console.log('playPauseBtn: playback error=', error);
                    this.showErrorAlert('Playback error: ' + error.message, this.plsUrlInput.value);
                    this.playerState = 'error';
                    this.updatePlayButton();
                });
                this.playPauseBtn.textContent = 'Pause';
                this.statusDiv.textContent = '';
            } else {
                this.audio.pause();
                this.playPauseBtn.textContent = 'Play';
            }
        });

        this.nextBtn.addEventListener('click', () => {
            this.clearShareUrl();
            this.segmentEnded = false;
            if (this.isSingleAudio || this.tracks.length === 1 || this.currentIndex >= this.tracks.length - 1) {
                this.statusDiv.textContent = 'No next track available.';
                console.log('nextBtn: click ignored');
                return;
            }
            this.playTrack(this.currentIndex + 1);
        });

        this.prevBtn.addEventListener('click', () => {
            this.clearShareUrl();
            this.segmentEnded = false;
            if (this.isSingleAudio || this.tracks.length === 1 || this.currentIndex <= 0) {
                this.statusDiv.textContent = 'No previous track available.';
                console.log('prevBtn: click ignored');
                return;
            }
            this.playTrack(this.currentIndex - 1);
        });

        this.container.querySelector('#load-playlist').addEventListener('click', () => {
            this.clearShareUrl();
            this.segmentEnded = false;
            this.errorShownForUrl = null;
            this.lastErrorTimestamp = 0;
            const url = this.plsUrlInput.value;
            const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg'];
            const playlistExtensions = ['.pls', '.m3u'];
            const isAudioExtension = audioExtensions.some(ext => url.toLowerCase().includes(ext));
            const isPlaylistExtension = playlistExtensions.some(ext => url.toLowerCase().endsWith(ext));
            const isSingleAudio = isAudioExtension && !isPlaylistExtension;
            console.log('load-playlist: url=', url, 'isSingleAudio=', isSingleAudio);
            this.tracks = [];
            this.currentIndex = 0;
            this.currentEnd = Infinity;
            this.audio.pause();
            this.playPauseBtn.textContent = 'Play';
            this.playerState = 'unloaded';
            this.updatePlayButton();
            this.updateNavButtons();
            this.statusDiv.textContent = '';
            this.updatePlaylistWindow();
            this.playlistLastModified = 'Unknown'; // Reset on load
            if (isSingleAudio) {
                this.isSingleAudio = true;
                this.loadSingleAudio(false);
            } else {
                this.isSingleAudio = false;
                this.loadPlaylist(false);
            }
        });

        this.speedUpBtn.addEventListener('click', () => {
            this.clearShareUrl();
            if (this.speedMode === '2x' && this.playbackRate >= this.maxSpeed) {
                console.log('speed-up: ignored, max speed reached');
                return;
            }
            this.changeSpeed(0.25);
        });

        this.speedDownBtn.addEventListener('click', () => {
            this.clearShareUrl();
            this.changeSpeed(-0.25);
        });

        this.audio.addEventListener('ended', () => {
            console.log('ended: currentIndex=', this.currentIndex);
            this.clearShareUrl();
            this.segmentEnded = false;
            this.playPauseBtn.textContent = 'Play';
            this.playerState = 'loaded';
            this.updatePlayButton();
            if (this.isSingleAudio || this.tracks.length === 1) {
                this.statusDiv.textContent = 'Audio ended. Click the green Play button or press SPACE to restart.';
            } else {
                this.playTrack(this.currentIndex + 1);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === ' ') {
                if (document.activeElement === this.plsUrlInput) {
                    console.log('Key SPACE: Ignored, URL input has focus');
                    return;
                }
                if (this.playerState !== 'loaded') {
                    console.log('Key SPACE: Ignored, playerState=', this.playerState);
                    return;
                }
                event.preventDefault();
                this.clearShareUrl();
                if (this.audio.paused) {
                    if (this.segmentEnded) {
                        this.currentEnd = isNaN(this.audio.duration) ? Infinity : this.audio.duration;
                        this.segmentEnded = false;
                        this.updateMetadata();
                        console.log('Key SPACE: Continuing past segment end, new currentEnd=', this.currentEnd);
                    }
                    this.audio.play().catch(error => {
                        console.log('Key SPACE: Playback error=', error);
                        this.showErrorAlert('Playback error: ' + error.message, this.plsUrlInput.value);
                        this.playerState = 'error';
                        this.updatePlayButton();
                    });
                    this.playPauseBtn.textContent = 'Pause';
                    this.statusDiv.textContent = '';
                    console.log('Key SPACE: Playing');
                } else {
                    this.audio.pause();
                    this.playPauseBtn.textContent = 'Play';
                    console.log('Key SPACE: Paused');
                }
                return;
            }

            if (event.key === 'c') {
                if (document.activeElement === this.plsUrlInput) {
                    console.log('Key c: Ignored, URL input has focus');
                    return;
                }
                event.preventDefault();
                this.clearUrlInput();
                console.log('Key c: URL input cleared and focused');
                return;
            }

            if (!this.tracks.length || this.currentIndex >= this.tracks.length) {
                return;
            }
            this.clearShareUrl();
            const track = this.tracks[this.currentIndex];
            let newTime = this.audio.currentTime;

            if (event.key === 'j') {
                const timeInput = prompt('Enter timestamp to jump to (HH:MM:SS)', '00:00:00');
                if (timeInput !== null) {
                    const timeFormat = /^(\d{2}:\d{2}:\d{2})$/;
                    if (timeFormat.test(timeInput)) {
                        newTime = this.parseTime(timeInput);
                        console.log(`Key j: Jumping to timestamp=${timeInput}, seconds=${newTime}`);
                    } else {
                        console.log(`Key j: Invalid timestamp format=${timeInput}, defaulting to 0`);
                        this.statusDiv.textContent = 'Invalid timestamp format. Use HH:MM:SS.';
                        newTime = 0;
                    }
                } else {
                    console.log('Key j: Prompt cancelled');
                    return;
                }
            } else if (event.key === 'J') {
                if (this.isSingleAudio || this.tracks.length <= 1) {
                    console.log('Key J: Ignored, no playlist available');
                    this.statusDiv.textContent = 'No playlist available to jump to a track.';
                    return;
                }
                const rowInput = prompt(`Enter playlist row number (1-${this.tracks.length})`, '');
                if (rowInput !== null) {
                    const rowNumber = parseInt(rowInput, 10);
                    if (!isNaN(rowNumber) && rowNumber >= 1 && rowNumber <= this.tracks.length) {
                        const targetIndex = rowNumber - 1; // Convert to 0-based index
                        console.log(`Key J: Jumping to row=${rowNumber}, index=${targetIndex}, url=${this.tracks[targetIndex].url}`);
                        this.segmentEnded = false;
                        this.playTrack(targetIndex);
                    } else {
                        console.log(`Key J: Invalid row number=${rowInput}`);
                        this.statusDiv.textContent = `Invalid row number. Enter a number between 1 and ${this.tracks.length}.`;
                    }
                } else {
                    console.log('Key J: Prompt cancelled');
                    return;
                }
            } else if (event.key === 'p' && this.audio.paused) {
                const currentTimeFormatted = this.formatTime(this.audio.currentTime);
                const audioUrl = encodeURIComponent(decodeURIComponent(track.baseUrl));
                const timeSegment = this.currentEnd === Infinity && track.originalEnd !== Infinity
                    ? `${this.formatTime(track.start)},${this.formatTime(track.originalEnd)}`
                    : this.currentEnd === Infinity
                        ? currentTimeFormatted
                        : `${this.formatTime(track.start)},${this.formatTime(this.currentEnd)}`;
                const shareUrl = this.playerBaseUrl ? `${this.playerBaseUrl}${audioUrl}#t=${timeSegment}` : `${track.baseUrl}#t=${timeSegment}`;
                this.shareUrlDiv.innerHTML = `Shareable URL: <a href="#" id="copy-share-url" style="color: #007bff; text-decoration: none;">${shareUrl}</a> (click to copy)`;
                const copyLink = this.shareUrlDiv.querySelector('#copy-share-url');
                copyLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        this.statusDiv.textContent = 'Copied to clipboard!';
                        console.log('Share URL copied:', shareUrl);
                    }).catch(err => {
                        this.statusDiv.textContent = 'Failed to copy URL.';
                        console.log('Share URL copy failed:', err);
                    });
                });
                console.log('Key p: Generated share URL=', shareUrl);
                return;
            } else if (event.key === 'P' && this.audio.paused) {
                const currentTimeFormatted = this.formatTime(this.audio.currentTime);
                const mediaUrl = `${track.baseUrl}#t=${currentTimeFormatted}`;
                this.shareUrlDiv.innerHTML = `Media URL: <a href="#" id="copy-media-url" style="color: #007bff; text-decoration: none;">${mediaUrl}</a> (click to copy)`;
                const copyLink = this.shareUrlDiv.querySelector('#copy-media-url');
                copyLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(mediaUrl).then(() => {
                        this.statusDiv.textContent = 'Media URL copied to clipboard!';
                        console.log('Key P: Media URL copied:', mediaUrl);
                    }).catch(err => {
                        this.statusDiv.textContent = 'Failed to copy media URL.';
                        console.log('Key P: Media URL copy failed:', err);
                    });
                });
                console.log('Key P: Generated media URL=', mediaUrl);
                return;
            } else if (event.shiftKey && event.key === 'ArrowUp') {
                newTime = isNaN(this.audio.currentTime) ? this.audio.currentTime : Math.min(this.audio.duration, this.audio.currentTime + 600);
                console.log('Shift+UpArrow: Jump forward 10 minutes, newTime=', newTime);
            } else if (event.shiftKey && event.key === 'ArrowDown') {
                newTime = Math.max(0, this.audio.currentTime - 600);
                console.log('Shift+DownArrow: Jump back 10 minutes, newTime=', newTime);
            } else {
                switch (event.key) {
                    case 'ArrowLeft':
                        newTime = this.audio.currentTime - 10;
                        break;
                    case 'ArrowRight':
                        newTime = this.audio.currentTime + 10;
                        break;
                    case 'ArrowUp':
                        newTime = this.audio.currentTime + 60;
                        break;
                    case 'ArrowDown':
                        newTime = this.audio.currentTime - 60;
                        break;
                    case 's':
                        newTime = track.start;
                        break;
                    case 'e':
                        newTime = track.end;
                        break;
                    case 'b':
                        newTime = 0;
                        break;
                    case 'n':
                        if (!isNaN(this.audio.duration)) {
                            newTime = this.audio.duration;
                        } else {
                            return;
                        }
                        break;
                    default:
                        return;
                }
            }

            this.audio.currentTime = Math.max(0, Math.min(isNaN(this.audio.duration) ? Infinity : this.audio.duration, newTime));
            this.currentTimeSpan.textContent = this.formatTime(this.audio.currentTime);
            if (newTime < this.currentEnd) {
                this.segmentEnded = false;
            }
        });
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    parseTime(timeStr) {
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 3) {
            const [hours, minutes, seconds] = parts;
            if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
                return hours * 3600 + minutes * 60 + seconds;
            }
        }
        return 0;
    }

    formatFileSize(bytes) {
        if (bytes === undefined || isNaN(bytes)) return 'Unknown';
        if (bytes < 1024) return `${bytes} bytes`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    formatDateTime(dateTimeStr) {
        try {
            const date = new Date(dateTimeStr);
            if (isNaN(date.getTime())) return 'Unknown';
            const year = date.getUTCFullYear();
            const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
            const day = date.getUTCDate().toString().padStart(2, '0');
            const hours = date.getUTCHours().toString().padStart(2, '0');
            const minutes = date.getUTCMinutes().toString().padStart(2, '0');
            const seconds = date.getUTCSeconds().toString().padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } catch (error) {
            console.log('formatDateTime: error parsing date=', dateTimeStr, 'error=', error);
            return 'Unknown';
        }
    }

    async loadPlaylist(isPreload = false) {
        const url = this.plsUrlInput.value;
        console.log('loadPlaylist: url=', url);
        if (!url) {
            this.showErrorAlert('Please enter a PLS URL.', url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            this.clearShareUrl();
            this.playlistLastModified = 'Unknown';
            return;
        }
        if (!this.isValidUrl(url)) {
            this.showErrorAlert('Invalid URL format. Please use http:// or https://.', url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            this.clearShareUrl();
            this.playlistLastModified = 'Unknown';
            return;
        }
        try {
            // Fetch Last-Modified header
            try {
                const headResponse = await fetch(url, { method: 'HEAD' });
                if (headResponse.ok) {
                    const lastModified = headResponse.headers.get('Last-Modified');
                    this.playlistLastModified = lastModified ? this.formatDateTime(lastModified) : 'Unknown';
                    console.log('loadPlaylist: Last-Modified=', this.playlistLastModified);
                } else {
                    this.playlistLastModified = 'Unknown';
                    console.log('loadPlaylist: HEAD request failed, status=', headResponse.status);
                }
            } catch (error) {
                this.playlistLastModified = 'Unknown';
                console.log('loadPlaylist: HEAD request error=', error);
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch playlist: ${response.statusText}`);
            const text = await response.text();
            this.tracks = this.parsePLS(text);
            if (this.tracks.length === 0) {
                this.showErrorAlert('No tracks found in playlist. Please check the PLS file format.', url);
                this.playerState = 'error';
                this.updatePlayButton();
                this.updateNavButtons();
                this.updatePlaylistWindow();
                this.clearShareUrl();
                this.playlistLastModified = 'Unknown';
                return;
            }
            this.prepareTrack(0, isPreload);
            if (isPreload && !this.isSingleAudio) {
                this.statusDiv.textContent = 'Audio loaded, click the green Play button or press SPACE to start.';
            }
        } catch (error) {
            console.log('loadPlaylist: error=', error);
            this.showErrorAlert('Error loading playlist: ' + error.message, url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            this.clearShareUrl();
            this.playlistLastModified = 'Unknown';
        }
    }

    async loadSingleAudio(isPreload = false) {
        const url = this.plsUrlInput.value;
        console.log('loadSingleAudio: url=', url);
        if (!url) {
            this.showErrorAlert('Please enter an audio URL.', url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            this.clearShareUrl();
            this.playlistLastModified = 'Unknown';
            return;
        }
        if (!this.isValidUrl(url)) {
            this.showErrorAlert('Invalid URL format. Please use http:// or https://.', url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            this.clearShareUrl();
            this.playlistLastModified = 'Unknown';
            return;
        }
        try {
            this.tracks = this.parseSingleAudio(url);
            if (this.tracks.length === 0) {
                this.showErrorAlert('Invalid audio URL.', url);
                this.playerState = 'error';
                this.updatePlayButton();
                this.updateNavButtons();
                this.updatePlaylistWindow();
                this.clearShareUrl();
                this.playlistLastModified = 'Unknown';
                return;
            }
            const track = this.tracks[0];
            let baseUrl = track.baseUrl;

            const isPageHttps = window.location.protocol === 'https:';
            const isAudioHttp = baseUrl.startsWith('http://');
            if (isPageHttps && isAudioHttp) {
                const httpPlayerUrl = this.getHttpPlayerUrl();
                this.showErrorAlert(`This page is secure (HTTPS), but the audio link is not (HTTP), so browsers block it. To play this audio:\n1. Open the player at ${httpPlayerUrl} (uses HTTP, not HTTPS).\n2. Or, use an audio link that starts with https:// and has a valid certificate.\n3. Or, download the audio and play it in a media player like VLC (get it at https://www.videolan.org/vlc/). Note: HTTP downloads are less secure, so only download from trusted sources.`, url);
                this.statusDiv.textContent = `Cannot play HTTP audio on an HTTPS page. Open ${httpPlayerUrl} (HTTP, not HTTPS), use an HTTPS audio link, or download and play in VLC (https://www.videolan.org/vlc/).`;
                this.playerState = 'error';
                this.updatePlayButton();
                this.updateNavButtons();
                this.updatePlaylistWindow();
                this.clearShareUrl();
                this.playlistLastModified = 'Unknown';
                return;
            }

            let audioSrc = baseUrl;
            if (isAudioHttp && !isPageHttps) {
                const httpsUrl = baseUrl.replace('http://', 'https://');
                console.log('loadSingleAudio: trying HTTPS URL=', httpsUrl);
                try {
                    const response = await fetch(httpsUrl, { method: 'HEAD' });
                    if (response.ok) {
                        console.log('loadSingleAudio: HTTPS URL is valid, using it');
                        audioSrc = httpsUrl;
                        track.baseUrl = httpsUrl;
                    } else {
                        console.log('loadSingleAudio: HTTPS URL failed, falling back to HTTP');
                    }
                } catch (error) {
                    console.log('loadSingleAudio: HTTPS check failed=', error);
                }
            }

            this.audio.src = `${audioSrc}?t=${Date.now()}`;
            const errorHandler = (event) => {
                const error = event.target.error;
                let errorMessage = 'Unknown error';
                if (error) {
                    switch (error.code) {
                        case MediaError.MEDIA_ERR_ABORTED:
                            errorMessage = 'Audio loading aborted';
                            break;
                        case MediaError.MEDIA_ERR_NETWORK:
                            errorMessage = 'Network error loading audio';
                            break;
                        case MediaError.MEDIA_ERR_DECODE:
                            errorMessage = 'Audio decoding error';
                            break;
                        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                            errorMessage = 'Audio format or source not supported';
                            break;
                    }
                } else if (audioSrc.startsWith('https://')) {
                    errorMessage = 'Invalid or expired SSL certificate';
                }
                console.log('loadSingleAudio: audio error=', errorMessage);
                const isPageHttps = window.location.protocol === 'https:';
                const isAudioHttp = audioSrc.startsWith('http://');
                const httpPlayerUrl = this.getHttpPlayerUrl();
                this.showErrorAlert(`Error loading audio: ${errorMessage}. ${isAudioHttp && isPageHttps ? `To play this audio:\n1. Open the player at ${httpPlayerUrl} (uses HTTP, not HTTPS).\n2. Or, use an audio link that starts with https:// and has a valid certificate.\n3. Or, download the audio and play it in a media player like VLC (get it at https://www.videolan.org/vlc/). Note: HTTP downloads are less secure, so only download from trusted sources.` : ''}`, url);
                this.statusDiv.textContent = `Error: ${errorMessage}. ${isAudioHttp && isPageHttps ? `Open ${httpPlayerUrl} (HTTP, not HTTPS), use an HTTPS audio link, or download and play in VLC (https://www.videolan.org/vlc/).` : ''}`;
                this.playerState = 'error';
                this.updatePlayButton();
                this.updateNavButtons();
                this.updatePlaylistWindow();
                this.clearShareUrl();
                this.audio.removeEventListener('error', errorHandler);
                this.playlistLastModified = 'Unknown';
            };
            this.audio.errorHandler = errorHandler; // Store for clearUrlInput
            this.audio.addEventListener('error', errorHandler, { once: true });
            this.prepareTrack(0, isPreload);
            if (isPreload && this.isSingleAudio) {
                this.statusDiv.textContent = 'Audio loaded, click the green Play button or press SPACE to start.';
            }
        } catch (error) {
            console.log('loadSingleAudio: error=', error);
            this.showErrorAlert('Error loading audio: ' + error.message, url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            this.clearShareUrl();
            this.playlistLastModified = 'Unknown';
        }
    }

    parsePLS(text) {
        console.log('parsePLS: raw text=', text);
        const lines = text.split('\n');
        let numEntries = 0;
        const trackMap = {};
        let validTracks = 0;

        lines.forEach((line, index) => {
            line = line.trim();
            if (!line || line.startsWith('[')) return;
            const [key, value] = line.split('=').map(part => part.trim());
            if (!key || !value) return;
            if (key === 'NumberOfEntries') {
                numEntries = parseInt(value, 10);
                return;
            }
            const match = key.match(/^(File|Title|Length)(\d+)$/);
            if (!match) {
                console.log(`parsePLS: Skipping invalid key at line ${index + 1}: ${key}`);
                return;
            }
            const [, type, numStr] = match;
            const num = parseInt(numStr, 10);
            if (isNaN(num)) {
                console.log(`parsePLS: Invalid track number at line ${index + 1}: ${numStr}`);
                return;
            }
            if (!trackMap[num]) trackMap[num] = {};
            if (type === 'File') {
                trackMap[num].url = value;
                const urlParts = value.split('#');
                trackMap[num].baseUrl = urlParts[0];
                trackMap[num].start = 0;
                trackMap[num].end = Infinity;
                trackMap[num].originalEnd = Infinity; // Store original end time
                if (urlParts[1]) {
                    if (urlParts[1].startsWith('?t=')) {
                        const times = urlParts[1].slice(3).split(',');
                        trackMap[num].start = this.parseTime(times[0]);
                        if (times[1]) {
                            trackMap[num].end = this.parseTime(times[1]);
                            trackMap[num].originalEnd = trackMap[num].end; // Preserve original end
                        }
                    } else if (urlParts[1].startsWith('t=')) {
                        const times = urlParts[1].slice(2).split(',');
                        const timeFormat = /^(\d{2}:\d{2}:\d{2})$/;
                        if (timeFormat.test(times[0])) {
                            trackMap[num].start = this.parseTime(times[0]);
                            if (times[1] && timeFormat.test(times[1])) {
                                trackMap[num].end = this.parseTime(times[1]);
                                trackMap[num].originalEnd = trackMap[num].end; // Preserve original end
                            }
                        } else {
                            trackMap[num].start = parseFloat(times[0]) || 0;
                            if (times[1]) {
                                trackMap[num].end = parseFloat(times[1]) || Infinity;
                                trackMap[num].originalEnd = trackMap[num].end; // Preserve original end
                            }
                        }
                    }
                }
                validTracks++;
            } else if (type === 'Title') {
                trackMap[num].title = value;
            } else if (type === 'Length') {
                trackMap[num].length = parseInt(value, 10);
            }
        });

        const trackList = [];
        for (let i = 1; i <= Math.max(numEntries, validTracks); i++) {
            if (trackMap[i] && trackMap[i].url) {
                trackList.push({
                    url: trackMap[i].url,
                    baseUrl: trackMap[i].baseUrl,
                    title: trackMap[i].title || 'Unknown',
                    length: trackMap[i].length || -1,
                    start: trackMap[i].start,
                    end: trackMap[i].end,
                    originalEnd: trackMap[i].originalEnd, // Include originalEnd
                    size: 'Unknown'
                });
            }
        }
        console.log('parsePLS: parsed tracks=', trackList);
        return trackList;
    }

    parseSingleAudio(url) {
        console.log('parseSingleAudio: url=', url);
        const urlParts = url.split('#');
        const baseUrl = decodeURIComponent(urlParts[0]);
        let start = 0;
        let end = Infinity;
        let originalEnd = Infinity; // Store original end time

        if (urlParts[1]) {
            if (urlParts[1].startsWith('?t=')) {
                const times = urlParts[1].slice(3).split(',');
                start = this.parseTime(times[0]);
                if (times[1]) {
                    end = this.parseTime(times[1]);
                    originalEnd = end; // Preserve original end
                }
            } else if (urlParts[1].startsWith('t=')) {
                const times = urlParts[1].slice(2).split(',');
                const timeFormat = /^(\d{2}:\d{2}:\d{2})$/;
                if (timeFormat.test(times[0])) {
                    start = this.parseTime(times[0]);
                    if (times[1] && timeFormat.test(times[1])) {
                        end = this.parseTime(times[1]);
                        originalEnd = end; // Preserve original end
                    }
                } else {
                    start = parseFloat(times[0]) || 0;
                    if (times[1]) {
                        end = parseFloat(times[1]) || Infinity;
                        originalEnd = end; // Preserve original end
                    }
                }
            }
        }

        const track = {
            url: url,
            baseUrl: baseUrl,
            title: baseUrl.split('/').pop() || 'Unknown',
            length: -1,
            start: start,
            end: end,
            originalEnd: originalEnd, // Include originalEnd
            size: 'Unknown'
        };
        console.log('parseSingleAudio: parsed track=', track);
        return [track];
    }

    async fetchMetadataWithRetry(url, retries = 2, delay = 1000) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await new Promise((resolve, reject) => {
                    jsmediatags.read(url, {
                        onSuccess: resolve,
                        onError: reject
                    });
                });
            } catch (error) {
                console.log(`fetchMetadataWithRetry: attempt ${attempt} failed, error=`, error);
                if (attempt === retries) {
                    console.log('fetchMetadataWithRetry: max retries reached');
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async prepareTrack(index, isPreload) {
        if (index < 0 || index >= this.tracks.length) {
            console.log('prepareTrack: invalid index=', index);
            this.statusDiv.textContent = 'No track available at this index.';
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            this.clearShareUrl();
            return;
        }
        this.currentIndex = index;
        this.segmentEnded = false;
        const track = this.tracks[index];
        this.currentEnd = track.end; // Explicitly set currentEnd to track.end
        console.log('prepareTrack: setting currentEnd=', this.currentEnd, 'for track=', track.url);
        try {
            const response = await fetch(track.baseUrl, { method: 'HEAD' });
            if (response.ok) {
                const contentLength = response.headers.get('Content-Length');
                track.size = contentLength ? this.formatFileSize(parseInt(contentLength, 10)) : 'Unknown';
            } else {
                track.size = 'Unknown';
            }
        } catch (error) {
            console.log('prepareTrack: fetch HEAD error=', error);
            track.size = 'Unknown';
        }

        this.audio.src = `${track.baseUrl}?t=${Date.now()}`;
        const errorHandler = (event) => {
            const error = event.target.error;
            let errorMessage = 'Unknown';
            if (error) {
                switch (error.code) {
                    case MediaError.MEDIA_ERR_ABORTED:
                        errorMessage = 'Audio loading aborted';
                        break;
                    case MediaError.MEDIA_ERR_NETWORK:
                        errorMessage = 'Network error loading audio';
                        break;
                    case MediaError.MEDIA_ERR_DECODE:
                        errorMessage = 'Audio decoding error';
                        break;
                    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        errorMessage = 'Audio format or source not supported';
                        break;
                }
            } else if (track.baseUrl.startsWith('https://')) {
                errorMessage = 'Invalid or expired SSL certificate';
            }
            console.log('prepareTrack: audio error=', errorMessage);
            const isPageHttps = window.location.protocol === 'https:';
            const isAudioHttp = track.baseUrl.startsWith('http://');
            const httpPlayerUrl = this.getHttpPlayerUrl();
            this.showErrorAlert(`Error loading audio: ${errorMessage}. ${isAudioHttp && isPageHttps ? `To play this audio:\n1. Open the player at ${httpPlayerUrl} (uses HTTP, not HTTPS).\n2. Or, use an audio link that starts with https:// and has a valid certificate.\n3. Or, download the audio and play it in a media player like VLC (get it at https://www.videolan.org/vlc/). Note: HTTP downloads are less secure, so only download from trusted sources.` : ''}`, this.plsUrlInput.value);
            this.statusDiv.textContent = `Error: ${errorMessage}. ${isAudioHttp && isPageHttps ? `Open ${httpPlayerUrl} (HTTP, not HTTPS), use an HTTPS audio link, or download and play in VLC (https://www.videolan.org/vlc/).` : ''}`;
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            this.clearShareUrl();
            this.audio.removeEventListener('error', errorHandler);
        };
        this.audio.errorHandler = errorHandler; // Store for clearUrlInput
        this.audio.addEventListener('error', errorHandler, { once: true });
        this.audio.currentTime = track.start;
        this.currentTimeSpan.textContent = this.formatTime(track.start);
        this.audio.addEventListener('loadedmetadata', () => {
            if (track.length === -1 && !isNaN(this.audio.duration)) {
                track.length = Math.floor(this.audio.duration);
            }
            this.audio.currentTime = track.start;
            this.currentTimeSpan.textContent = this.formatTime(this.audio.currentTime);
            this.playerState = 'loaded';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            if (!isPreload) {
                this.audio.play().catch(error => {
                    console.log('prepareTrack: playback error=', error);
                    this.showErrorAlert('Playback error: ' + error.message, this.plsUrlInput.value);
                    this.playerState = 'error';
                    this.updatePlayButton();
                    this.updateNavButtons();
                    this.updatePlaylistWindow();
                    this.clearShareUrl();
                });
                this.playPauseBtn.textContent = 'Pause';
            } else {
                this.statusDiv.textContent = 'Audio loaded, click the green Play button or press SPACE to start.';
            }
            this.updateMetadata();
        }, { once: true });
        this.audio.load();
        if (typeof jsmediatags !== 'undefined') {
            try {
                this.fetchMetadataWithRetry(track.baseUrl).then(tag => {
                    const tags = tag.tags;
                    console.log('prepareTrack: metadata tags=', tags);
                    track.title = tags.title || track.title || 'Unknown';
                    track.artist = tags.artist || 'Unknown';
                    track.album = tags.album || 'Unknown';
                    track.genre = tags.genre || 'Unknown';
                    track.year = tags.year || 'Unknown';
                    track.recordingDate = tags.TDRC?.data || tags.TDAT?.data || tags.date || 'Unknown';
                    track.trackNumber = tags.track || 'Unknown';
                    track.comment = (tags.comment && tags.comment.text) || 'Unknown';
                    if (tags.TLEN && tags.TLEN.data) {
                        track.length = Math.floor(parseInt(tags.TLEN.data) / 1000);
                    }
                    this.updateMetadata();
                }).catch(error => {
                    console.log('prepareTrack: metadata fetch error=', error);
                    this.updateMetadata();
                });
            } catch (e) {
                console.log('prepareTrack: jsmediatags error=', e);
                this.updateMetadata();
            }
        } else {
            console.log('prepareTrack: jsmediatags not available');
            this.updateMetadata();
        }
    }

    playTrack(index) {
        if (index < 0 || index >= this.tracks.length) {
            console.log('playTrack: invalid index=', index);
            this.statusDiv.textContent = 'No more tracks available.';
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            this.clearShareUrl();
            return;
        }
        this.prepareTrack(index, false);
    }

    updateMetadata() {
        const track = this.tracks[this.currentIndex];
        const unknownFields = [];
        if (track.title === 'Unknown' || track.title === 'undefined' || track.title === '' || track.title === undefined) unknownFields.push('Title');
        if (track.artist === 'Unknown' || track.artist === 'undefined' || track.artist === '' || track.artist === undefined) unknownFields.push('Artist');
        if (track.album === 'Unknown' || track.album === 'undefined' || track.album === '' || track.album === undefined) unknownFields.push('Album');
        if (track.genre === 'Unknown' || track.genre === 'undefined' || track.genre === '' || track.genre === undefined) unknownFields.push('Genre');
        if (track.year === 'Unknown' || track.year === 'undefined' || track.year === '' || track.year === undefined) unknownFields.push('Year');
        if (track.recordingDate === 'Unknown' || track.recordingDate === 'undefined' || track.recordingDate === '' || track.recordingDate === undefined) unknownFields.push('Date');
        if (track.trackNumber === 'Unknown' || track.trackNumber === 'undefined' || track.trackNumber === '' || track.trackNumber === undefined) unknownFields.push('Track Number');
        if (track.comment === 'Unknown' || track.comment === 'undefined' || track.comment === '' || track.comment === undefined) unknownFields.push('Comment');
        if (track.length <= 0) unknownFields.push('Length');
        if (track.size === 'Unknown' || track.size === 'undefined' || track.size === '' || track.size === undefined) unknownFields.push('Size');

        let metadataHtml = '';
        if (track.title && track.title !== 'Unknown' && track.title !== 'undefined' && track.title !== '') metadataHtml += `Title: ${track.title}<br>`;
        if (track.artist && track.artist !== 'Unknown' && track.artist !== 'undefined' && track.artist !== '') metadataHtml += `Artist: ${track.artist}<br>`;
        if (track.album && track.album !== 'Unknown' && track.album !== 'undefined' && track.album !== '') metadataHtml += `Album: ${track.album}<br>`;
        if (track.genre && track.genre !== 'Unknown' && track.genre !== 'undefined' && track.genre !== '') metadataHtml += `Genre: ${track.genre}<br>`;
        if (track.year && track.year !== 'Unknown' && track.year !== 'undefined' && track.year !== '') metadataHtml += `Year: ${track.year}<br>`;
        if (track.recordingDate && track.recordingDate !== 'Unknown' && track.recordingDate !== 'undefined' && track.recordingDate !== '') metadataHtml += `Date: ${track.recordingDate}<br>`;
        if (track.trackNumber && track.trackNumber !== 'Unknown' && track.trackNumber !== 'undefined' && track.trackNumber !== '') metadataHtml += `Track Number: ${track.trackNumber}<br>`;
        if (track.comment && track.comment !== 'Unknown' && track.comment !== 'undefined' && track.comment !== '') metadataHtml += `Comment: ${track.comment}<br>`;
        if (track.length > 0) metadataHtml += `Length: ${this.formatTime(track.length)}<br>`;
        if (track.size && track.size !== 'Unknown' && track.size !== 'undefined' && track.size !== '') metadataHtml += `Size: ${track.size}<br>`;
        metadataHtml += `Segment: From ${this.formatTime(track.start)} to ${this.currentEnd === Infinity ? 'end' : this.formatTime(this.currentEnd)}<br>`;
        metadataHtml += `URL: <a href="${track.url}" target="_blank" title="Warning: Clicking this link will take you away from the player." style="color: inherit; text-decoration: none;">${track.url}</a>`;
        if (unknownFields.length > 0) {
            metadataHtml += `<br>Unknown Fields: ${unknownFields.join('; ')}`;
        }

        this.metadataDiv.innerHTML = metadataHtml;
    }

    changeSpeed(delta) {
        if (this.speedMode === 'normal') {
            this.playbackRate = Math.max(0.25, this.playbackRate + delta);
        } else if (this.speedMode === '2x') {
            if (delta > 0) {
                this.playbackRate = this.playbackRate * 2;
            } else {
                this.playbackRate = Math.max(0.25, this.playbackRate * 0.5);
            }
        }
        this.audio.playbackRate = this.playbackRate;
        this.speedSpan.textContent = this.playbackRate.toFixed(2);
        this.updateSpeedButtons();
        console.log(`changeSpeed: mode=${this.speedMode}, new playbackRate=${this.playbackRate}`);
    }
}
