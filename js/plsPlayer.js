// plsPlayer.js
// Version: 1.0.77.7
// Changelog:
// - Added updateMetadata method for consistent metadata display
// - Improved error handling in playTrack and prepareTrack
// - Optimized parsePLS to handle malformed files
// - Consolidated URL parsing logic
// - Enhanced UI state management for better accessibility
// - Added debouncing to showErrorAlert
// - Ensured complete code without truncation

class PLSPlayer {
    static version = "1.0.77.7";

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
        this.playerBaseUrl = playerBaseUrl || `http://${window.location.host}/plar.html?audio=`;
        this.defaultUrl = defaultUrl;
        this.configUrl = configUrl;
        this.playlistLastModified = 'Unknown';

        try {
            this.setupUI();
        } catch (error) {
            console.error('Failed to setup UI:', error);
            this.container.innerHTML = `<div style="color: red; padding: 10px;">UI setup error: ${error.message}</div>`;
            throw new Error(`UI setup error: ${error.message}`);
        }

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

        const loadUrl = async () => {
            let urlToLoad = null;
            let isSingleAudio = false;
            const audioMatch = window.location.search.match(/[?&]audio=([^&]*)/);
            const playlistMatch = window.location.search.match(/[?&]playlist=([^&]*)/);

            if (audioMatch) {
                urlToLoad = decodeURIComponent(audioMatch[1]).replace(/%23/g, '#') + (window.location.hash || '');
                isSingleAudio = urlToLoad.toLowerCase().includes('.mp3');
            } else if (playlistMatch) {
                urlToLoad = decodeURIComponent(playlistMatch[1]);
                isSingleAudio = false;
            } else if (playlistUrl) {
                urlToLoad = playlistUrl;
                isSingleAudio = playlistUrl.toLowerCase().includes('.mp3');
            } else if (this.defaultUrl) {
                urlToLoad = this.defaultUrl;
                isSingleAudio = this.defaultUrl.toLowerCase().includes('.mp3');
            } else if (this.configUrl) {
                try {
                    const response = await fetch(this.configUrl, { headers: { 'Accept': 'application/json' } });
                    if (!response.ok) throw new Error(`Failed to fetch config: ${response.status}`);
                    const config = await response.json();
                    if (config.defaultUrl && this.isValidUrl(config.defaultUrl)) {
                        urlToLoad = config.defaultUrl;
                        isSingleAudio = config.defaultUrl.toLowerCase().includes('.mp3');
                    } else {
                        this.showErrorAlert('Invalid defaultUrl in config.', this.configUrl);
                    }
                } catch (error) {
                    this.showErrorAlert(`Failed to load config: ${error.message}`, this.configUrl);
                }
            }

            if (urlToLoad) {
                this.plsUrlInput.value = urlToLoad;
                this.isSingleAudio = isSingleAudio;
                try {
                    await (isSingleAudio ? this.loadSingleAudio(true) : this.loadPlaylist(true));
                } catch (error) {
                    this.showErrorAlert(`Failed to load URL: ${error.message}`, urlToLoad);
                    this.playerState = 'error';
                    this.updatePlayButton();
                    this.updateNavButtons();
                    this.updatePlaylistWindow();
                }
            } else {
                this.statusDiv.textContent = 'No URL provided. Enter a playlist or audio URL and click Load.';
            }
        };

        loadUrl().then(() => this.setupEventListeners()).catch(error => {
            this.showErrorAlert(`Initialization error: ${error.message}`, '');
        });
    }

    setupUI() {
        this.container.innerHTML = `
            <div style="margin-bottom: 10px;">
                <input id="pls-url" type="text" placeholder="Enter PLS or audio URL (e.g., http://example.com/song.mp3#t=00:00:10)" style="width: 70%; max-width: 800px; font-size: 16px; padding: 8px;">
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
            <div id="metadata" style="margin-top: 10px; padding: 10px; border: 1px solid #ccc;">Metadata will appear here.</div>
            <div id="status" style="margin-top: 10px;"></div>
            <div id="share-url" style="margin-top: 10px;"></div>
            <div id="playlist-window" style="margin-top: 10px;"></div>
            <div id="footer" style="margin-top: 10px; font-size: 14px; color: #333;">
                <p>If the player isn't working, try these steps: 1) Use a modern browser (Chrome, Firefox, Edge, Safari). 2) Ensure the URL starts with http:// or https:// and points to a valid audio file (.mp3) or playlist (.pls). 3) For HTTP/HTTPS errors, use an HTTP player URL: ${this.getHttpPlayerUrl()}. 4) Check your internet connection. 5) Contact the website owner or try another file.</p>
            </div>
            <style>
                @media screen and (max-width: 600px) {
                    #pls-url { width: 90% !important; }
                    #current-time { font-size: 18px !important; }
                }
            </style>
        `;
    }

    updatePlayButton() {
        this.playPauseBtn.setAttribute('aria-disabled', this.playerState !== 'loaded');
        this.playPauseBtn.style.backgroundColor = this.playerState !== 'loaded' ? '#ccc' : '#28a745';
        this.playPauseBtn.style.cursor = this.playerState !== 'loaded' ? 'not-allowed' : 'pointer';
    }

    async fetchMetadataWithRetry(url, retries = 3, delay = 1000) {
        let metadata = { size: 'Unknown', lastModified: 'Unknown', title: 'Unknown', artist: 'Unknown', album: 'Unknown' };
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, { method: 'HEAD' });
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                metadata.size = this.formatFileSize(parseInt(response.headers.get('content-length') || '0', 10));
                metadata.lastModified = response.headers.get('last-modified') ? this.formatDateTime(new Date(response.headers.get('last-modified'))) : 'Unknown';
                if (typeof window.jsmediatags !== 'undefined') {
                    const tags = await new Promise((resolve, reject) => {
                        window.jsmediatags.read(url, {
                            onSuccess: tag => resolve(tag.tags),
                            onError: error => reject(error)
                        });
                    });
                    metadata.title = tags.title || metadata.title;
                    metadata.artist = tags.artist || metadata.artist;
                    metadata.album = tags.album || metadata.album;
                }
                return metadata;
            } catch (error) {
                console.warn(`fetchMetadataWithRetry: attempt ${i + 1} failed, error=`, error);
                if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return metadata;
    }

    setupEventListeners() {
        this.container.querySelector('#about').addEventListener('click', () => {
            this.clearShareUrl();
            alert(`PLS Playlist or Audio Player commit ${config['commit-shorthash'] || 'unknown'}\nPlaylist Last Modified: ${this.playlistLastModified}\n\nSupports PLS playlists or single audio files (MP3/MP4) with play/pause, next/prev, speed controls, and segment playback via #t=start,end or #t=HH:MM:SS,HH:MM:SS. Use arrow keys for navigation and 'SPACE', 's', 'e', 'b', 'n', 'p', 'P', 'j', 'J', 'c' keys for control. HTTP audio may not play on HTTPS pages; use HTTP player URL: ${this.getHttpPlayerUrl()}.`);
        });

        this.container.querySelector('#help').addEventListener('click', () => {
            this.clearShareUrl();
            alert(`Enter a PLS or audio URL, or use ?playlist=URL or ?audio=URL. Supports MP3/MP4 with play/pause, next/prev, speed controls, and #t=start,end segments. Arrow keys: Left/Right (±10s), Up/Down (±60s), Shift+Up/Down (±10min). Keys: 'SPACE' (play/pause), 's' (segment start), 'e' (segment end), 'b' (beginning), 'n' (end), 'p' (share URL), 'P' (media URL), 'j' (jump to timestamp), 'J' (jump to track), 'c' (clear URL). HTTP audio may not play on HTTPS pages; use HTTP player URL: ${this.getHttpPlayerUrl()}.`);
        });

        this.container.querySelector('#clear-url').addEventListener('click', () => this.clearUrlInput());

        this.container.querySelector('#speed-mode').addEventListener('click', () => {
            this.clearShareUrl();
            this.speedMode = this.speedMode === 'normal' ? '2x' : 'normal';
            if (this.speedMode === 'normal') this.playbackRate = 1.0;
            this.audio.playbackRate = this.playbackRate;
            this.speedSpan.textContent = this.playbackRate.toFixed(2);
            this.container.querySelector('#speed-mode').textContent = this.speedMode === 'normal' ? '2x Mode' : 'Normal Mode';
            this.updateSpeedButtons();
        });

        this.plsUrlInput.addEventListener('input', (event) => {
            this.clearShareUrl();
            if (event.target.value === 'h' && event.inputType === 'insertText') {
                event.target.value = 'http://';
                event.target.setSelectionRange(7, 7);
            }
            this.errorShownForUrl = null;
        });

        this.plsUrlInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.clearShareUrl();
                this.errorShownForUrl = null;
                this.lastErrorTimestamp = 0;
                this.container.querySelector('#load-playlist').click();
            }
        });

        this.audio.addEventListener('timeupdate', () => {
            this.currentTimeSpan.textContent = this.formatTime(this.audio.currentTime);
            if (this.audio.currentTime >= this.currentEnd - 0.5 && !this.audio.paused && !this.segmentEnded) {
                this.audio.pause();
                this.playPauseBtn.textContent = 'Play';
                this.playerState = 'loaded';
                this.segmentEnded = true;
                this.updatePlayButton();
                if (this.isSingleAudio || this.tracks.length === 1) {
                    this.statusDiv.textContent = 'Segment ended. Click Play or press SPACE to continue.';
                } else {
                    this.playTrack(this.currentIndex + 1);
                }
            }
        });

        this.playPauseBtn.addEventListener('click', () => {
            if (this.playerState !== 'loaded') return;
            this.clearShareUrl();
            if (this.audio.paused) {
                if (this.segmentEnded) {
                    this.currentEnd = isNaN(this.audio.duration) ? Infinity : this.audio.duration;
                    this.segmentEnded = false;
                    this.updateMetadata();
                }
                this.audio.play().catch(error => {
                    this.showErrorAlert(`Playback error: ${error.message}`, this.plsUrlInput.value);
                    this.playerState = 'error';
                    this.updatePlayButton();
                });
                this.playPauseBtn.textContent = 'Pause';
                this.statusDiv.textContent = '';
            } else {
                this.audio.pause();
                this.playPauseBtn.textContent = 'Play';
            }
            this.updatePlayButton();
        });

        this.nextBtn.addEventListener('click', () => {
            this.clearShareUrl();
            this.segmentEnded = false;
            if (this.isSingleAudio || this.tracks.length === 1 || this.currentIndex >= this.tracks.length - 1) {
                this.statusDiv.textContent = 'No next track available.';
                return;
            }
            this.playTrack(this.currentIndex + 1);
        });

        this.prevBtn.addEventListener('click', () => {
            this.clearShareUrl();
            this.segmentEnded = false;
            if (this.isSingleAudio || this.tracks.length === 1 || this.currentIndex <= 0) {
                this.statusDiv.textContent = 'No previous track available.';
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
            this.isSingleAudio = url.toLowerCase().includes('.mp3');
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
            this.playlistLastModified = 'Unknown';
            if (this.isSingleAudio) {
                this.loadSingleAudio(false);
            } else {
                this.loadPlaylist(false);
            }
        });

        this.speedUpBtn.addEventListener('click', () => {
            this.clearShareUrl();
            if (this.speedMode === '2x' && this.playbackRate >= this.maxSpeed) return;
            this.changeSpeed(0.25);
        });

        this.speedDownBtn.addEventListener('click', () => {
            this.clearShareUrl();
            this.changeSpeed(-0.25);
        });

        this.audio.addEventListener('ended', () => {
            this.clearShareUrl();
            this.segmentEnded = false;
            this.playPauseBtn.textContent = 'Play';
            this.playerState = 'loaded';
            this.updatePlayButton();
            if (this.isSingleAudio || this.tracks.length === 1) {
                this.statusDiv.textContent = 'Audio ended. Click Play or press SPACE to restart.';
            } else {
                this.playTrack(this.currentIndex + 1);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (document.activeElement === this.plsUrlInput && event.key !== 'Enter') return;
            this.clearShareUrl();
            if (event.key === ' ' && this.playerState === 'loaded') {
                event.preventDefault();
                if (this.audio.paused) {
                    if (this.segmentEnded) {
                        this.currentEnd = isNaN(this.audio.duration) ? Infinity : this.audio.duration;
                        this.segmentEnded = false;
                        this.updateMetadata();
                    }
                    this.audio.play().catch(error => {
                        this.showErrorAlert(`Playback error: ${error.message}`, this.plsUrlInput.value);
                        this.playerState = 'error';
                        this.updatePlayButton();
                    });
                    this.playPauseBtn.textContent = 'Pause';
                    this.statusDiv.textContent = '';
                } else {
                    this.audio.pause();
                    this.playPauseBtn.textContent = 'Play';
                }
                this.updatePlayButton();
                return;
            }

            if (event.key === 'c') {
                event.preventDefault();
                this.clearUrlInput();
                return;
            }

            if (!this.tracks.length || this.currentIndex >= this.tracks.length) return;
            const track = this.tracks[this.currentIndex];
            let newTime = this.audio.currentTime;

            if (event.key === 'j') {
                const timeInput = prompt('Enter timestamp (HH:MM:SS)', '00:00:00');
                if (timeInput && /^(\d{2}:\d{2}:\d{2})$/.test(timeInput)) {
                    newTime = this.parseTime(timeInput);
                } else {
                    this.statusDiv.textContent = 'Invalid timestamp format. Use HH:MM:SS.';
                    newTime = 0;
                }
            } else if (event.key === 'J' && !this.isSingleAudio && this.tracks.length > 1) {
                const rowInput = prompt(`Enter playlist row number (1-${this.tracks.length})`, '');
                const rowNumber = parseInt(rowInput, 10);
                if (!isNaN(rowNumber) && rowNumber >= 1 && rowNumber <= this.tracks.length) {
                    this.segmentEnded = false;
                    this.playTrack(rowNumber - 1);
                    return;
                } else {
                    this.statusDiv.textContent = `Invalid row number. Enter 1-${this.tracks.length}.`;
                    return;
                }
            } else if (event.key === 'p' && this.audio.paused) {
                const currentTimeFormatted = this.formatTime(this.audio.currentTime);
                const audioUrl = decodeURIComponent(track.baseUrl);
                const timeSegment = this.currentEnd === Infinity && track.originalEnd !== Infinity
                    ? `${this.formatTime(track.start)},${this.formatTime(track.originalEnd)}`
                    : this.currentEnd === Infinity
                        ? currentTimeFormatted
                        : `${this.formatTime(track.start)},${this.formatTime(this.currentEnd)}`;
                const shareUrl = this.playerBaseUrl ? `${this.playerBaseUrl}${audioUrl}#t=${timeSegment}` : `${track.baseUrl}#t=${timeSegment}`;
                this.shareUrlDiv.innerHTML = `Shareable URL: <a href="#" id="copy-share-url">${shareUrl}</a> (click to copy)`;
                this.shareUrlDiv.querySelector('#copy-share-url').addEventListener('click', (e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        this.statusDiv.textContent = 'Copied to clipboard!';
                    }).catch(() => {
                        this.statusDiv.textContent = 'Failed to copy URL.';
                    });
                });
                return;
            } else if (event.key === 'P' && this.audio.paused) {
                const mediaUrl = `${track.baseUrl}#t=${this.formatTime(this.audio.currentTime)}`;
                this.shareUrlDiv.innerHTML = `Media URL: <a href="#" id="copy-media-url">${mediaUrl}</a> (click to copy)`;
                this.shareUrlDiv.querySelector('#copy-media-url').addEventListener('click', (e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(mediaUrl).then(() => {
                        this.statusDiv.textContent = 'Media URL copied!';
                    }).catch(() => {
                        this.statusDiv.textContent = 'Failed to copy media URL.';
                    });
                });
                return;
            } else {
                switch (event.key) {
                    case 'ArrowLeft': newTime -= 10; break;
                    case 'ArrowRight': newTime += 10; break;
                    case 'ArrowUp': newTime += 60; break;
                    case 'ArrowDown': newTime -= 60; break;
                    case 's': newTime = track.start; break;
                    case 'e': newTime = track.end; break;
                    case 'b': newTime = 0; break;
                    case 'n': newTime = isNaN(this.audio.duration) ? Infinity : this.audio.duration; break;
                    default: return;
                }
            }

            this.audio.currentTime = Math.max(0, Math.min(isNaN(this.audio.duration) ? Infinity : this.audio.duration, newTime));
            this.currentTimeSpan.textContent = this.formatTime(this.audio.currentTime);
            if (newTime < this.currentEnd) this.segmentEnded = false;
        });
    }

    updateNavButtons() {
        const disabled = this.isSingleAudio || this.tracks.length <= 1 || this.playerState !== 'loaded';
        this.prevBtn.setAttribute('aria-disabled', disabled || this.currentIndex <= 0);
        this.nextBtn.setAttribute('aria-disabled', disabled || this.currentIndex >= this.tracks.length - 1);
        this.prevBtn.style.backgroundColor = disabled || this.currentIndex <= 0 ? '#ccc' : '#6c757d';
        this.nextBtn.style.backgroundColor = disabled || this.currentIndex >= this.tracks.length - 1 ? '#ccc' : '#6c757d';
        this.prevBtn.style.cursor = disabled || this.currentIndex <= 0 ? 'not-allowed' : 'pointer';
        this.nextBtn.style.cursor = disabled || this.currentIndex >= this.tracks.length - 1 ? 'not-allowed' : 'pointer';
    }

    updateSpeedButtons() {
        const disabled = this.playerState !== 'loaded';
        this.speedUpBtn.setAttribute('aria-disabled', disabled || (this.speedMode === '2x' && this.playbackRate >= this.maxSpeed));
        this.speedDownBtn.setAttribute('aria-disabled', disabled || this.playbackRate <= 0.25);
        this.speedUpBtn.style.backgroundColor = disabled || (this.speedMode === '2x' && this.playbackRate >= this.maxSpeed) ? '#ccc' : '#6c757d';
        this.speedDownBtn.style.backgroundColor = disabled || this.playbackRate <= 0.25 ? '#ccc' : '#6c757d';
        this.speedUpBtn.style.cursor = disabled || (this.speedMode === '2x' && this.playbackRate >= this.maxSpeed) ? 'not-allowed' : 'pointer';
        this.speedDownBtn.style.cursor = disabled || this.playbackRate <= 0.25 ? 'not-allowed' : 'pointer';
    }

    updatePlaylistWindow() {
        if (this.isSingleAudio || this.tracks.length <= 1) {
            this.playlistWindow.innerHTML = '';
            return;
        }
        const maxRows = 10;
        let startIndex = Math.max(0, this.currentIndex - 3);
        let endIndex = Math.min(this.tracks.length, startIndex + maxRows);
        if (endIndex - startIndex < maxRows) startIndex = Math.max(0, endIndex - maxRows);
        let html = `<div style="border: 1px solid #ccc; padding: 10px; max-height: 300px; overflow-y: auto;">
            <p>Total tracks: ${this.tracks.length} | Last Modified: ${this.playlistLastModified}</p>
            <table style="width: 100%; border-collapse: collapse;">`;
        for (let i = startIndex; i < endIndex; i++) {
            const track = this.tracks[i];
            html += `
                <tr style="background-color: ${i === this.currentIndex ? '#e9ecef' : 'transparent'}; cursor: pointer;" onclick="document.getElementById('player-container').PLSPlayer.playTrack(${i});">
                    <td style="padding: 5px; border: 1px solid #ddd;">${i + 1}</td>
                    <td style="padding: 5px; border: 1px solid #ddd;"><a href="${track.url}" style="color: #007bff; text-decoration: none;">${track.title}</a></td>
                    <td style="padding: 5px; border: 1px solid #ddd;">${track.length >= 0 ? this.formatTime(track.length) : 'Unknown'}</td>
                </tr>`;
        }
        html += `</table></div>`;
        this.playlistWindow.innerHTML = html;
        document.getElementById('player-container').PLSPlayer = this;
    }

    isValidUrl(url) {
        return /^(https?:\/\/)[\w\-]+(\.[\w\-]+)+[/#?]?.*$/.test(url.split('#')[0]);
    }

    async loadSingleAudio(isPreload = false) {
        const url = this.plsUrlInput.value;
        if (!url) {
            this.statusDiv.textContent = 'Please enter a playlist or audio URL and click Load.';
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            return;
        }
        if (!this.isValidUrl(url)) {
            this.showErrorAlert('Invalid URL format. Use http:// or https://.', url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            return;
        }
        try {
            const track = this.parseSingleAudio(url);
            this.tracks = [track];
            this.currentIndex = 0;
            this.isSingleAudio = true;
            await this.prepareTrack(0, isPreload);
            if (isPreload) {
                this.statusDiv.textContent = 'Audio loaded, click Play or press SPACE to start.';
            }
        } catch (error) {
            this.showErrorAlert(`Failed to load audio: ${error.message}`, url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
        }
    }

    parseSingleAudio(url) {
        const urlParts = url.split('#t=');
        let baseUrl = urlParts[0];
        let start = 0;
        let end = Infinity;
        let title = baseUrl.split('/').pop() || 'Unknown';

        if (urlParts[1]) {
            const timeParts = urlParts[1].split(',');
            if (timeParts[0].includes(':')) {
                start = this.parseTime(timeParts[0]);
                end = timeParts[1] ? this.parseTime(timeParts[1]) : Infinity;
            } else {
                start = parseFloat(timeParts[0]) || 0;
                end = timeParts[1] ? parseFloat(timeParts[1]) : Infinity;
            }
        }

        return { url, baseUrl, title, length: -1, start, end, originalEnd: end, size: 'Unknown', lastModified: 'Unknown' };
    }

    async prepareTrack(index, isPreload) {
        if (index < 0 || index >= this.tracks.length) {
            this.statusDiv.textContent = 'Invalid track index.';
            return;
        }
        this.currentIndex = index;
        const track = this.tracks[index];
        this.audio.src = `${track.baseUrl}?t=${Date.now()}`;
        this.audio.currentTime = track.start;
        this.currentEnd = track.end;
        this.playerState = 'loaded';
        this.updatePlayButton();
        this.updateNavButtons();
        this.updatePlaylistWindow();
        try {
            const metadata = await this.fetchMetadataWithRetry(track.baseUrl);
            track.size = metadata.size;
            track.lastModified = metadata.lastModified;
            track.title = metadata.title || track.title;
            track.artist = metadata.artist;
            track.album = metadata.album;
            this.updateMetadata();
        } catch (error) {
            this.statusDiv.textContent = 'Failed to fetch metadata.';
        }
        if (!isPreload) {
            this.audio.play().catch(error => {
                this.showErrorAlert(`Playback error: ${error.message}`, track.baseUrl);
                this.playerState = 'error';
                this.updatePlayButton();
            });
        }
    }

    updateMetadata() {
        const track = this.tracks[this.currentIndex];
        if (!track) {
            this.metadataDiv.textContent = 'Metadata will appear here.';
            return;
        }
        this.metadataDiv.textContent = `Title: ${track.title}\nArtist: ${track.artist || 'Unknown'}\nAlbum: ${track.album || 'Unknown'}\nSize: ${track.size}\nLast Modified: ${track.lastModified}`;
    }

    changeSpeed(delta) {
        this.playbackRate = Math.max(0.25, Math.min(this.speedMode === '2x' ? this.maxSpeed : 2.0, this.playbackRate + delta));
        this.audio.playbackRate = this.playbackRate;
        this.speedSpan.textContent = this.playbackRate.toFixed(2);
        this.updateSpeedButtons();
    }

    showErrorAlert(message, url) {
        if (this.errorShownForUrl === url && Date.now() - this.lastErrorTimestamp < this.errorDebounceMs) return;
        this.errorShownForUrl = url;
        this.lastErrorTimestamp = Date.now();
        alert(`${message}\n\nTry these steps:\n1) Use a modern browser (Chrome, Firefox, Edge, Safari).\n2) Ensure the URL starts with http:// or https:// and points to a valid audio file or playlist.\n3) For HTTP/HTTPS issues, use an HTTP player URL: ${this.getHttpPlayerUrl()}.\n4) Check your internet connection.\n5) Contact the website owner or try another file.`);
        this.statusDiv.textContent = message;
    }

    clearUrlInput() {
        this.plsUrlInput.value = '';
        this.tracks = [];
        this.currentIndex = 0;
        this.currentEnd = Infinity;
        this.audio.src = '';
        this.audio.pause();
        this.playPauseBtn.textContent = 'Play';
        this.playerState = 'unloaded';
        this.statusDiv.textContent = 'URL cleared. Enter a new URL and click Load.';
        this.updatePlayButton();
        this.updateNavButtons();
        this.updatePlaylistWindow();
        this.clearShareUrl();
        this.plsUrlInput.focus();
        this.metadataDiv.textContent = 'Metadata will appear here.';
        this.playlistLastModified = 'Unknown';
    }

    getHttpPlayerUrl() {
        return `http://${window.location.host}${window.location.pathname}`;
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds === Infinity) return '00:00:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    parseTime(timeStr) {
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 1) return parts[0];
        return 0;
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    formatDateTime(date) {
        return date.toUTCString();
    }

    async loadPlaylist(isPreload = false) {
        const url = this.plsUrlInput.value;
        if (!url) {
            this.statusDiv.textContent = 'Please enter a playlist or audio URL and click Load.';
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            return;
        }
        if (!this.isValidUrl(url)) {
            this.showErrorAlert('Invalid URL format. Use http:// or https://.', url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
            return;
        }
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            this.playlistLastModified = response.headers.get('last-modified') ? this.formatDateTime(new Date(response.headers.get('last-modified'))) : 'Unknown';
            const text = await response.text();
            this.tracks = this.parsePLS(text, url);
            if (this.tracks.length === 0) throw new Error('No valid tracks found in playlist.');
            this.currentIndex = 0;
            await this.prepareTrack(0, isPreload);
            if (isPreload) {
                this.statusDiv.textContent = 'Playlist loaded, click Play or press SPACE to start.';
            }
        } catch (error) {
            this.showErrorAlert(`Error loading playlist: ${error.message}`, url);
            this.playerState = 'error';
            this.updatePlayButton();
            this.updateNavButtons();
            this.updatePlaylistWindow();
        }
    }

    parsePLS(text, playlistUrl) {
        const tracks = [];
        const lines = text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
        let currentTrack = null;

        for (const line of lines) {
            const fileMatch = line.match(/File\d+\s*=\s*(.+)/i);
            const titleMatch = line.match(/Title\d+\s*=\s*(.+)/i);
            const lengthMatch = line.match(/Length\d+\s*=\s*(.+)/i);

            if (fileMatch) {
                if (currentTrack && currentTrack.url && this.isValidUrl(currentTrack.url)) {
                    const track = this.parseTrackUrl(currentTrack.url);
                    track.title = currentTrack.title || track.title;
                    track.length = currentTrack.length !== null ? currentTrack.length : -1;
                    tracks.push(track);
                }
                currentTrack = { url: fileMatch[1].trim(), title: null, length: null };
            } else if (titleMatch && currentTrack) {
                currentTrack.title = titleMatch[1].trim();
            } else if (lengthMatch && currentTrack) {
                currentTrack.length = parseInt(lengthMatch[1], 10) || -1;
            }
        }

        if (currentTrack && currentTrack.url && this.isValidUrl(currentTrack.url)) {
            const track = this.parseTrackUrl(currentTrack.url);
            track.title = currentTrack.title || track.title;
            track.length = currentTrack.length !== null ? currentTrack.length : -1;
            tracks.push(track);
        }

        if (tracks.length === 0) {
            for (const line of lines) {
                const urlMatch = line.match(/^(https?:\/\/[^\s]+)/i);
                if (urlMatch && this.isValidUrl(urlMatch[1])) {
                    tracks.push(this.parseTrackUrl(urlMatch[1]));
                }
            }
        }

        return tracks;
    }

    parseTrackUrl(url) {
        const urlParts = url.split('#t=');
        let baseUrl = urlParts[0];
        let start = 0;
        let end = Infinity;
        let title = baseUrl.split('/').pop() || 'Unknown';

        if (urlParts[1]) {
            const timeParts = urlParts[1].split(',');
            if (timeParts[0].includes(':')) {
                start = this.parseTime(timeParts[0]);
                end = timeParts[1] ? this.parseTime(timeParts[1]) : Infinity;
            } else {
                start = parseFloat(timeParts[0]) || 0;
                end = timeParts[1] ? parseFloat(timeParts[1]) : Infinity;
            }
        }

        return { url, baseUrl, title, length: -1, start, end, originalEnd: end, size: 'Unknown', lastModified: 'Unknown' };
    }

    async playTrack(index) {
        if (index < 0 || index >= this.tracks.length) {
            this.statusDiv.textContent = 'Invalid track index.';
            return;
        }
        this.currentIndex = index;
        const track = this.tracks[index];
        this.audio.src = `${track.baseUrl}?t=${Date.now()}`;
        this.audio.currentTime = track.start;
        this.currentEnd = track.end;
        this.playerState = 'loaded';
        this.updatePlayButton();
        this.updateNavButtons();
        this.updatePlaylistWindow();
        try {
            const metadata = await this.fetchMetadataWithRetry(track.baseUrl);
            track.size = metadata.size;
            track.lastModified = metadata.lastModified;
            track.title = metadata.title || track.title;
            track.artist = metadata.artist;
            track.album = metadata.album;
            this.updateMetadata();
        } catch (error) {
            this.statusDiv.textContent = 'Failed to fetch metadata.';
        }
        this.audio.play().catch(error => {
            this.showErrorAlert(`Playback error: ${error.message}`, track.baseUrl);
            this.playerState = 'error';
            this.updatePlayButton();
        });
    }

    clearShareUrl() {
        this.shareUrlDiv.innerHTML = '';
    }
}
