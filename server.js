"use strict";

require("dotenv").config();

const path = require("path");
const crypto = require("crypto");

const os = require("os");
const fs = require("fs");
const childProcess = require("child_process");

const express = require("express");
const session = require("express-session");
const ical = require("node-ical");

const app = express();

const FileStore =
    require("session-file-store")(
        session
    );

const PORT =
    Number(process.env.PORT) ||
    3000;

const CALENDAR_ICS_URL =
    process.env.CALENDAR_ICS_URL ||
    "";

const SPOTIFY_CLIENT_ID =
    process.env.SPOTIFY_CLIENT_ID ||
    "";

const SPOTIFY_CLIENT_SECRET =
    process.env.SPOTIFY_CLIENT_SECRET ||
    "";

const SPOTIFY_REDIRECT_URI =
    process.env.SPOTIFY_REDIRECT_URI ||
    "";

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    "change-this-secret";

const CALENDAR_CACHE_MS =
    60 * 1000;

const SPOTIFY_SCOPES = [
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-modify-playback-state"
].join(" ");

const GITHUB_TOKEN =
    process.env.GITHUB_TOKEN ||
    "";

const GITHUB_USERNAME =
    process.env.GITHUB_USERNAME ||
    "";

let calendarCache = {
    loadedAt: 0,
    entries: null
};

app.use(express.json());

app.use(
    session({
        name: "pihub.sid",

        store:
            new FileStore({
                path:
                    path.join(
                        __dirname,
                        ".sessions"
                    ),

                retries: 1,

                ttl:
                    30 *
                    24 *
                    60 *
                    60
            }),

        secret:
            SESSION_SECRET,

        resave:
            false,

        saveUninitialized:
            false,

        rolling:
            true,

        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,

            maxAge:
                30 *
                24 *
                60 *
                60 *
                1000
        }
    })
);

/* ==========================================
   Shared helpers
========================================== */

function parseDateOnly(value) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const parts =
        value.split("-");

    const year =
        Number(parts[0]);

    const month =
        Number(parts[1]) - 1;

    const day =
        Number(parts[2]);

    const date =
        new Date(
            year,
            month,
            day,
            0,
            0,
            0,
            0
        );

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function startOfDay(date) {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        0,
        0,
        0,
        0
    );
}

function addDays(
    date,
    amount
) {
    const result =
        new Date(date);

    result.setDate(
        result.getDate() +
        amount
    );

    return result;
}

/* ==========================================
   Calendar helpers
========================================== */

function isAllDayEvent(event) {
    return (
        event.datetype === "date" ||
        (
            event.start &&
            event.start.dateOnly === true
        )
    );
}

function eventOverlapsRange(
    eventStart,
    eventEnd,
    rangeStart,
    rangeEnd
) {
    return (
        eventStart < rangeEnd &&
        eventEnd > rangeStart
    );
}

async function loadCalendarEntries() {
    const now =
        Date.now();

    const cacheIsFresh =
        calendarCache.entries &&
        now -
            calendarCache.loadedAt <
            CALENDAR_CACHE_MS;

    if (cacheIsFresh) {
        return calendarCache.entries;
    }

    if (!CALENDAR_ICS_URL) {
        throw new Error(
            "CALENDAR_ICS_URL is missing from .env"
        );
    }

    const entries =
        await ical.async.fromURL(
            CALENDAR_ICS_URL
        );

    calendarCache = {
        loadedAt: now,
        entries
    };

    return entries;
}

function normaliseCalendarEvent(
    event,
    start,
    end,
    recurringId
) {
    return {
        id:
            recurringId ||
            event.uid ||
            event.id ||
            "",

        title:
            event.summary ||
            "Untitled event",

        description:
            event.description ||
            "",

        location:
            event.location ||
            "",

        start:
            start.toISOString(),

        end:
            end.toISOString(),

        allDay:
            isAllDayEvent(event),

        status:
            event.status ||
            "CONFIRMED"
    };
}

function expandRecurringEvent(
    event,
    rangeStart,
    rangeEnd
) {
    if (
        !event.rrule ||
        typeof event.rrule.between !==
            "function"
    ) {
        return [];
    }

    const originalStart =
        new Date(event.start);

    const originalEnd =
        event.end
            ? new Date(event.end)
            : new Date(
                originalStart.getTime() +
                60 *
                    60 *
                    1000
            );

    const duration =
        originalEnd.getTime() -
        originalStart.getTime();

    const searchStart =
        new Date(
            rangeStart.getTime() -
            Math.max(
                duration,
                24 *
                    60 *
                    60 *
                    1000
            )
        );

    const occurrences =
        event.rrule.between(
            searchStart,
            rangeEnd,
            true
        );

    const output = [];

    for (
        const occurrence
        of occurrences
    ) {
        const occurrenceStart =
            new Date(occurrence);

        const occurrenceEnd =
            new Date(
                occurrenceStart.getTime() +
                duration
            );

        if (
            !eventOverlapsRange(
                occurrenceStart,
                occurrenceEnd,
                rangeStart,
                rangeEnd
            )
        ) {
            continue;
        }

        output.push(
            normaliseCalendarEvent(
                event,
                occurrenceStart,
                occurrenceEnd,

                String(
                    event.uid ||
                    ""
                ) +
                    "-" +
                    occurrenceStart
                        .toISOString()
            )
        );
    }

    return output;
}

function convertCalendarEntries(
    entries,
    rangeStart,
    rangeEnd
) {
    const events = [];

    for (
        const entry
        of Object.values(entries)
    ) {
        if (
            !entry ||
            entry.type !==
                "VEVENT" ||
            !entry.start
        ) {
            continue;
        }

        if (
            String(
                entry.status
            ).toUpperCase() ===
            "CANCELLED"
        ) {
            continue;
        }

        if (entry.rrule) {
            events.push(
                ...expandRecurringEvent(
                    entry,
                    rangeStart,
                    rangeEnd
                )
            );

            continue;
        }

        const eventStart =
            new Date(
                entry.start
            );

        const eventEnd =
            entry.end
                ? new Date(
                    entry.end
                )
                : new Date(
                    eventStart.getTime() +
                    60 *
                        60 *
                        1000
                );

        if (
            !eventOverlapsRange(
                eventStart,
                eventEnd,
                rangeStart,
                rangeEnd
            )
        ) {
            continue;
        }

        events.push(
            normaliseCalendarEvent(
                entry,
                eventStart,
                eventEnd
            )
        );
    }

    events.sort(
        function (
            first,
            second
        ) {
            return (
                new Date(
                    first.start
                ) -
                new Date(
                    second.start
                )
            );
        }
    );

    return events;
}

/* ==========================================
   Spotify token helpers
========================================== */

function spotifyConfigured() {
    return Boolean(
        SPOTIFY_CLIENT_ID &&
        SPOTIFY_CLIENT_SECRET &&
        SPOTIFY_REDIRECT_URI
    );
}

function spotifyBasicAuth() {
    const credentials =
        SPOTIFY_CLIENT_ID +
        ":" +
        SPOTIFY_CLIENT_SECRET;

    return (
        "Basic " +
        Buffer
            .from(credentials)
            .toString("base64")
    );
}

async function readResponseBody(
    response
) {
    const text =
        await response.text();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return {
            message: text
        };
    }
}

async function requestSpotifyTokens(
    parameters
) {
    const response =
        await fetch(
            "https://accounts.spotify.com/api/token",
            {
                method: "POST",

                headers: {
                    Authorization:
                        spotifyBasicAuth(),

                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams(
                        parameters
                    )
            }
        );

    const data =
        await readResponseBody(
            response
        );

    if (!response.ok) {
        throw new Error(
            data &&
            (
                data.error_description ||
                data.error
            )
                ? (
                    data.error_description ||
                    data.error
                )
                : "Spotify token request failed."
        );
    }

    return data;
}

function storeSpotifyTokens(
    request,
    tokenData
) {
    const previous =
        request.session.spotify ||
        {};

    request.session.spotify = {
        accessToken:
            tokenData.access_token ||
            previous.accessToken ||
            "",

        refreshToken:
            tokenData.refresh_token ||
            previous.refreshToken ||
            "",

        expiresAt:
            Date.now() +
            (
                Number(
                    tokenData.expires_in
                ) ||
                3600
            ) *
                1000
    };
}

async function refreshSpotifyToken(
    request
) {
    const spotify =
        request.session.spotify;

    if (
        !spotify ||
        !spotify.refreshToken
    ) {
        return null;
    }

    const tokenData =
        await requestSpotifyTokens({
            grant_type:
                "refresh_token",

            refresh_token:
                spotify.refreshToken
        });

    storeSpotifyTokens(
        request,
        tokenData
    );

    return (
        request.session
            .spotify
            .accessToken
    );
}

async function getSpotifyToken(
    request
) {
    const spotify =
        request.session.spotify;

    if (
        !spotify ||
        !spotify.accessToken
    ) {
        return null;
    }

    const tokenStillValid =
        Date.now() <
        spotify.expiresAt -
            60 *
                1000;

    if (tokenStillValid) {
        return spotify.accessToken;
    }

    return refreshSpotifyToken(
        request
    );
}

async function spotifyFetch(
    request,
    endpoint,
    options
) {
    let accessToken =
        await getSpotifyToken(
            request
        );

    if (!accessToken) {
        const error =
            new Error(
                "Spotify is not connected."
            );

        error.status = 401;
        throw error;
    }

    const requestOptions =
        Object.assign(
            {
                method: "GET",
                headers: {}
            },
            options || {}
        );

    requestOptions.headers =
        Object.assign(
            {},
            requestOptions.headers || {},
            {
                Authorization:
                    "Bearer " +
                    accessToken
            }
        );

    if (
        requestOptions.body &&
        typeof requestOptions.body !==
            "string"
    ) {
        requestOptions.headers[
            "Content-Type"
        ] = "application/json";

        requestOptions.body =
            JSON.stringify(
                requestOptions.body
            );
    }

    let response =
        await fetch(
            "https://api.spotify.com/v1" +
                endpoint,
            requestOptions
        );

    if (response.status === 401) {
        accessToken =
            await refreshSpotifyToken(
                request
            );

        if (!accessToken) {
            const error =
                new Error(
                    "Spotify needs to be connected again."
                );

            error.status = 401;
            throw error;
        }

        requestOptions.headers.Authorization =
            "Bearer " +
            accessToken;

        response =
            await fetch(
                "https://api.spotify.com/v1" +
                    endpoint,
                requestOptions
            );
    }

    return response;
}

async function sendSpotifyControl(
    request,
    response,
    endpoint,
    method
) {
    try {
        const spotifyResponse =
            await spotifyFetch(
                request,
                endpoint,
                {
                    method
                }
            );

        if (
            spotifyResponse.status ===
            204
        ) {
            return response.json({
                success: true
            });
        }

        const details =
            await readResponseBody(
                spotifyResponse
            );

        return response
            .status(
                spotifyResponse.status
            )
            .json({
                success: false,

                error:
                    details &&
                    details.error &&
                    details.error.message
                        ? details.error.message
                        : "Spotify control failed."
            });
    } catch (error) {
        console.error(
            "Spotify control failed:",
            error
        );

        return response
            .status(
                error.status || 500
            )
            .json({
                success: false,
                error: error.message
            });
    }
}

/* ==========================================
   Raspberry Pi statistics helpers
========================================== */

function getCpuTimes() {
    var cpus =
        os.cpus();

    var idle = 0;
    var total = 0;

    cpus.forEach(function (cpu) {
        idle +=
            cpu.times.idle;

        total +=
            cpu.times.user +
            cpu.times.nice +
            cpu.times.sys +
            cpu.times.idle +
            cpu.times.irq;
    });

    return {
        idle,
        total
    };
}

function measureCpuUsage() {
    return new Promise(
        function (resolve) {
            var first =
                getCpuTimes();

            setTimeout(
                function () {
                    var second =
                        getCpuTimes();

                    var idleDifference =
                        second.idle -
                        first.idle;

                    var totalDifference =
                        second.total -
                        first.total;

                    if (
                        totalDifference <= 0
                    ) {
                        return resolve(0);
                    }

                    var usage =
                        100 -
                        (
                            idleDifference /
                            totalDifference
                        ) *
                            100;

                    resolve(
                        Math.max(
                            0,
                            Math.min(
                                100,
                                Math.round(
                                    usage
                                )
                            )
                        )
                    );
                },
                250
            );
        }
    );
}

function getMemoryUsage() {
    var total =
        os.totalmem();

    var free =
        os.freemem();

    if (!total) {
        return 0;
    }

    return Math.round(
        (
            (
                total -
                free
            ) /
            total
        ) *
        100
    );
}

function getTemperature() {
    try {
        var raw =
            fs.readFileSync(
                "/sys/class/thermal/thermal_zone0/temp",
                "utf8"
            );

        var value =
            Number(
                raw.trim()
            );

        if (
            Number.isFinite(value)
        ) {
            return Math.round(
                value / 1000
            );
        }
    } catch (error) {
        /*
            This file normally exists on Raspberry Pi.
            It will not exist when developing on macOS.
        */
    }

    return null;
}

function getIpAddress() {
    var interfaces =
        os.networkInterfaces();

    for (
        var interfaceName
        in interfaces
    ) {
        var addresses =
            interfaces[
                interfaceName
            ] || [];

        for (
            var index = 0;
            index <
                addresses.length;
            index += 1
        ) {
            var address =
                addresses[index];

            if (
                address.family ===
                    "IPv4" &&
                !address.internal
            ) {
                return address.address;
            }
        }
    }

    return null;
}

function getDiskUsage() {
    return new Promise(
        function (resolve) {
            childProcess.exec(
                "df -k /",
                function (
                    error,
                    stdout
                ) {
                    if (
                        error ||
                        !stdout
                    ) {
                        return resolve(
                            null
                        );
                    }

                    var lines =
                        stdout
                            .trim()
                            .split(
                                /\r?\n/
                            );

                    if (
                        lines.length <
                        2
                    ) {
                        return resolve(
                            null
                        );
                    }

                    var columns =
                        lines[
                            lines.length -
                            1
                        ]
                            .trim()
                            .split(
                                /\s+/
                            );

                    var percentage =
                        columns.find(
                            function (
                                value
                            ) {
                                return /^\d+%$/.test(
                                    value
                                );
                            }
                        );

                    if (!percentage) {
                        return resolve(
                            null
                        );
                    }

                    resolve(
                        Number(
                            percentage.replace(
                                "%",
                                ""
                            )
                        )
                    );
                }
            );
        }
    );
}

function formatUptime(
    seconds
) {
    var totalMinutes =
        Math.floor(
            seconds / 60
        );

    var days =
        Math.floor(
            totalMinutes /
            1440
        );

    var hours =
        Math.floor(
            (
                totalMinutes %
                1440
            ) /
            60
        );

    var minutes =
        totalMinutes % 60;

    if (days > 0) {
        return (
            days +
            "d " +
            hours +
            "h"
        );
    }

    if (hours > 0) {
        return (
            hours +
            "h " +
            minutes +
            "m"
        );
    }

    return minutes + "m";
}

/* ==========================================
   Calendar routes
========================================== */

app.get(
    "/api/calendar/events",
    async function (
        request,
        response
    ) {
        try {
            const startDate =
                parseDateOnly(
                    request.query.start
                );

            const endDate =
                parseDateOnly(
                    request.query.end
                );

            if (
                !startDate ||
                !endDate
            ) {
                return response
                    .status(400)
                    .json({
                        error:
                            "Use start and end in YYYY-MM-DD format."
                    });
            }

            const rangeStart =
                startOfDay(
                    startDate
                );

            const rangeEnd =
                addDays(
                    startOfDay(
                        endDate
                    ),
                    1
                );

            if (
                rangeEnd <=
                rangeStart
            ) {
                return response
                    .status(400)
                    .json({
                        error:
                            "The end date must not be before the start date."
                    });
            }

            const entries =
                await loadCalendarEntries();

            const events =
                convertCalendarEntries(
                    entries,
                    rangeStart,
                    rangeEnd
                );

            return response.json({
                events,

                cachedAt:
                    calendarCache.loadedAt
            });
        } catch (error) {
            console.error(
                "Calendar request failed:",
                error
            );

            return response
                .status(500)
                .json({
                    error:
                        "Unable to load the calendar."
                });
        }
    }
);

app.get(
    "/api/calendar/status",
    async function (
        request,
        response
    ) {
        try {
            const entries =
                await loadCalendarEntries();

            const eventCount =
                Object
                    .values(entries)
                    .filter(
                        function (
                            entry
                        ) {
                            return (
                                entry &&
                                entry.type ===
                                    "VEVENT"
                            );
                        }
                    )
                    .length;

            return response.json({
                connected: true,
                eventCount
            });
        } catch (error) {
            return response
                .status(500)
                .json({
                    connected: false,
                    error: error.message
                });
        }
    }
);

/* ==========================================
   Spotify login and callback routes
========================================== */

app.get(
    "/api/spotify/login",
    function (
        request,
        response
    ) {
        if (
            !spotifyConfigured()
        ) {
            return response
                .status(500)
                .send(
                    "Spotify is not configured in .env."
                );
        }

        const state =
            crypto
                .randomBytes(16)
                .toString("hex");

        request.session
            .spotifyOauthState =
            state;

        const parameters =
            new URLSearchParams({
                client_id:
                    SPOTIFY_CLIENT_ID,

                response_type:
                    "code",

                redirect_uri:
                    SPOTIFY_REDIRECT_URI,

                scope:
                    SPOTIFY_SCOPES,

                state,

                show_dialog:
                    "false"
            });

        return response.redirect(
            "https://accounts.spotify.com/authorize?" +
                parameters.toString()
        );
    }
);

app.get(
    "/api/spotify/callback",
    async function (
        request,
        response
    ) {
        try {
            const code =
                request.query.code;

            const state =
                request.query.state;

            const expectedState =
                request.session
                    .spotifyOauthState;

            if (
                !code ||
                !state ||
                !expectedState ||
                state !==
                    expectedState
            ) {
                return response
                    .status(400)
                    .send(
                        "Invalid Spotify callback."
                    );
            }

            delete request.session
                .spotifyOauthState;

            const tokenData =
                await requestSpotifyTokens({
                    grant_type:
                        "authorization_code",

                    code,

                    redirect_uri:
                        SPOTIFY_REDIRECT_URI
                });

                storeSpotifyTokens(
                    request,
                    tokenData
                );
                
                request.session.save(
                    function (error) {
                        if (error) {
                            console.error(
                                "Spotify session save failed:",
                                error
                            );
                
                            return response
                                .status(500)
                                .send(
                                    "Spotify connected, but the session could not be saved."
                                );
                        }
                
                        return response.redirect(
                            "/spotify.html"
                        );
                    }
                );
        } catch (error) {
            console.error(
                "Spotify callback failed:",
                error
            );

            return response
                .status(500)
                .send(
                    "Spotify connection failed: " +
                    error.message
                );
        }
    }
);

/* ==========================================
   Spotify playback route
========================================== */

app.get(
    "/api/spotify/playback",
    async function (
        request,
        response
    ) {
        try {
            const accessToken =
                await getSpotifyToken(
                    request
                );

            if (!accessToken) {
                return response.json({
                    connected: false,
                    active: false,
                    track: null
                });
            }

            const spotifyResponse =
                await spotifyFetch(
                    request,
                    "/me/player",
                    {
                        method: "GET"
                    }
                );

            if (
                spotifyResponse.status ===
                204
            ) {
                return response.json({
                    connected: true,
                    active: false,
                    track: null
                });
            }

            const data =
                await readResponseBody(
                    spotifyResponse
                );

            if (
                !spotifyResponse.ok
            ) {
                return response
                    .status(
                        spotifyResponse.status
                    )
                    .json({
                        connected: true,
                        active: false,
                        track: null,

                        error:
                            data &&
                            data.error &&
                            data.error.message
                                ? data.error.message
                                : "Unable to read Spotify playback."
                    });
            }

            const item =
                data &&
                data.item
                    ? data.item
                    : null;

            const images =
                item &&
                item.album &&
                Array.isArray(
                    item.album.images
                )
                    ? item.album.images
                    : [];

            const artists =
                item &&
                Array.isArray(
                    item.artists
                )
                    ? item.artists
                        .map(
                            function (
                                artist
                            ) {
                                return artist.name;
                            }
                        )
                        .join(", ")
                    : "";

            return response.json({
                connected: true,

                active:
                    Boolean(
                        data.device
                    ),

                isPlaying:
                    Boolean(
                        data.is_playing
                    ),

                progressMs:
                    Number(
                        data.progress_ms
                    ) || 0,

                durationMs:
                    item
                        ? Number(
                            item.duration_ms
                        ) || 0
                        : 0,

                track:
                    item
                        ? {
                            name:
                                item.name ||
                                "Unknown track",

                            artists:
                                artists ||
                                "Unknown artist",

                            artwork:
                                images.length
                                    ? images[0].url
                                    : ""
                        }
                        : null,

                device:
                    data.device
                        ? {
                            id:
                                data.device.id ||
                                "",

                            name:
                                data.device.name ||
                                "Spotify device",

                            volume:
                                Number(
                                    data.device
                                        .volume_percent
                                ) || 0,

                            active:
                                Boolean(
                                    data.device
                                        .is_active
                                )
                        }
                        : null
            });
        } catch (error) {
            console.error(
                "Spotify playback failed:",
                error
            );

            return response
                .status(
                    error.status || 500
                )
                .json({
                    connected: false,
                    active: false,
                    track: null,
                    error: error.message
                });
        }
    }
);

/* ==========================================
   Spotify playback controls
========================================== */

app.put(
    "/api/spotify/play",
    function (
        request,
        response
    ) {
        return sendSpotifyControl(
            request,
            response,
            "/me/player/play",
            "PUT"
        );
    }
);

app.put(
    "/api/spotify/pause",
    function (
        request,
        response
    ) {
        return sendSpotifyControl(
            request,
            response,
            "/me/player/pause",
            "PUT"
        );
    }
);

app.post(
    "/api/spotify/next",
    function (
        request,
        response
    ) {
        return sendSpotifyControl(
            request,
            response,
            "/me/player/next",
            "POST"
        );
    }
);

app.post(
    "/api/spotify/previous",
    function (
        request,
        response
    ) {
        return sendSpotifyControl(
            request,
            response,
            "/me/player/previous",
            "POST"
        );
    }
);

app.put(
    "/api/spotify/volume",
    async function (request, response) {
        try {
            var volume =
                Number(
                    request.body &&
                    request.body.volume
                );

            if (
                !Number.isFinite(volume)
            ) {
                return response
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Volume was not supplied correctly."
                    });
            }

            volume =
                Math.max(
                    0,
                    Math.min(
                        100,
                        Math.round(volume)
                    )
                );

                const spotifyResponse =
                await spotifyFetch(
                    request,
                    "/me/player/volume?volume_percent=" +
                        encodeURIComponent(volume),
                    {
                        method: "PUT"
                    }
                );
            
            if (spotifyResponse.status !== 204) {
                const details =
                    await readResponseBody(
                        spotifyResponse
                    );
            
                return response
                    .status(spotifyResponse.status)
                    .json({
                        success: false,
                        error:
                            details &&
                            details.error &&
                            details.error.message
                                ? details.error.message
                                : "Spotify volume failed."
                    });
            }

            return response.json({
                success: true,
                volume: volume
            });
        } catch (error) {
            console.error(
                "Spotify volume error:",
                error
            );

            return response
                .status(
                    error.status || 500
                )
                .json({
                    success: false,
                    error:
                        error.message ||
                        "Spotify volume failed."
                });
        }
    }
);

app.post(
    "/api/spotify/logout",
    function (
        request,
        response
    ) {
        delete request.session
            .spotify;

        delete request.session
            .spotifyOauthState;

        return response.json({
            success: true
        });
    }
);

/* ==========================================
   Spotify status
========================================== */

app.get(
    "/api/spotify/status",
    async function (
        request,
        response
    ) {
        try {
            const token =
                await getSpotifyToken(
                    request
                );

            return response.json({
                configured:
                    spotifyConfigured(),

                connected:
                    Boolean(token)
            });
        } catch (error) {
            return response.json({
                configured:
                    spotifyConfigured(),

                connected: false,

                error:
                    error.message
            });
        }
    }
);

/* ==========================================
   GitHub contributions
========================================== */

app.get(
    "/api/github/contributions",
    async function (
        request,
        response
    ) {
        try {
            if (
                !GITHUB_TOKEN ||
                !GITHUB_USERNAME
            ) {
                return response
                    .status(500)
                    .json({
                        error:
                            "GITHUB_TOKEN or GITHUB_USERNAME is missing from .env."
                    });
            }

            const now =
                new Date();

            const year =
                now.getFullYear();

            const from =
                new Date(
                    year,
                    0,
                    1,
                    0,
                    0,
                    0,
                    0
                ).toISOString();

            const to =
                new Date(
                    year,
                    11,
                    31,
                    23,
                    59,
                    59,
                    999
                ).toISOString();

            const query = `
                query GitHubContributions(
                    $username: String!,
                    $from: DateTime!,
                    $to: DateTime!
                ) {
                    user(login: $username) {
                        contributionsCollection(
                            from: $from,
                            to: $to
                        ) {
                            totalCommitContributions
                            totalPullRequestContributions
                            totalIssueContributions

                            contributionCalendar {
                                totalContributions

                                weeks {
                                    contributionDays {
                                        date
                                        contributionCount
                                        contributionLevel
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const githubResponse =
                await fetch(
                    "https://api.github.com/graphql",
                    {
                        method: "POST",

                        headers: {
                            Authorization:
                                "Bearer " +
                                GITHUB_TOKEN,

                            Accept:
                                "application/vnd.github+json",

                            "Content-Type":
                                "application/json",

                            "User-Agent":
                                "PiHub-Ambient"
                        },

                        body:
                            JSON.stringify({
                                query,

                                variables: {
                                    username:
                                        GITHUB_USERNAME,

                                    from,

                                    to
                                }
                            })
                    }
                );

            const data =
                await githubResponse.json();

            if (!githubResponse.ok) {
                console.error(
                    "GitHub HTTP error:",
                    data
                );

                return response
                    .status(
                        githubResponse.status
                    )
                    .json({
                        error:
                            "GitHub request failed."
                    });
            }

            if (
                Array.isArray(
                    data.errors
                ) &&
                data.errors.length
            ) {
                console.error(
                    "GitHub GraphQL errors:",
                    data.errors
                );

                return response
                    .status(502)
                    .json({
                        error:
                            data.errors[0]
                                .message ||
                            "GitHub GraphQL request failed."
                    });
            }

            if (
                !data.data ||
                !data.data.user
            ) {
                return response
                    .status(404)
                    .json({
                        error:
                            "GitHub user not found."
                    });
            }

            const collection =
                data.data.user
                    .contributionsCollection;

            const calendar =
                collection
                    .contributionCalendar;

            return response.json({
                year,

                contributions:
                    calendar
                        .totalContributions,

                commits:
                    collection
                        .totalCommitContributions,

                pullRequests:
                    collection
                        .totalPullRequestContributions,

                issues:
                    collection
                        .totalIssueContributions,

                weeks:
                    calendar.weeks
            });
        } catch (error) {
            console.error(
                "GitHub request failed:",
                error
            );

            return response
                .status(500)
                .json({
                    error:
                        "Unable to load GitHub contributions."
                });
        }
    }
);

/* ==========================================
   Raspberry Pi statistics
========================================== */

app.get(
    "/api/raspberry-pi/stats",
    async function (
        request,
        response
    ) {
        try {
            var results =
                await Promise.all([
                    measureCpuUsage(),
                    getDiskUsage()
                ]);

            var cpu =
                results[0];

            var disk =
                results[1];

            var ram =
                getMemoryUsage();

            var temperature =
                getTemperature();

            var uptimeSeconds =
                Math.floor(
                    os.uptime()
                );

            var ipAddress =
                getIpAddress();

                return response.json({
                    online: true,
                
                    hostname:
                        os.hostname(),
                
                    platform:
                        os.platform(),
                
                    /* CPU aliases */
                    cpu:
                        cpu,
                
                    cpuPercent:
                        cpu,
                
                    cpuUsage:
                        cpu,
                
                    /* RAM aliases */
                    ram:
                        os.platform() === "darwin"
                            ? null
                            : ram,

                    ramPercent:
                        os.platform() === "darwin"
                            ? null
                            : ram,

                    memory:
                        os.platform() === "darwin"
                            ? null
                            : ram,

                    memoryUsage:
                        os.platform() === "darwin"
                            ? null
                            : ram,
                
                    /* Disk aliases */
                    disk:
                        disk,
                
                    diskPercent:
                        disk,
                
                    diskUsage:
                        disk,
                
                    /* Temperature will be null on macOS */
                    temperature:
                        temperature,
                
                    temp:
                        temperature,
                
                    /* Keep this numeric for frontend calculations */
                    uptime:
                        uptimeSeconds,
                
                    uptimeSeconds:
                        uptimeSeconds,
                
                    /* Optional formatted version */
                    uptimeFormatted:
                        formatUptime(
                            uptimeSeconds
                        ),
                
                    /* IP aliases */
                    ipAddress:
                        ipAddress ||
                        "Unavailable",
                
                    ip:
                        ipAddress ||
                        "Unavailable",
                
                    timestamp:
                        Date.now()
                });
        } catch (error) {
            console.error(
                "Raspberry Pi stats failed:",
                error
            );

            return response
                .status(500)
                .json({
                    online: false,
                    error:
                        "Unable to read system statistics."
                });
        }
    }
);

/* ==========================================
   Static frontend
========================================== */

app.use(
    express.static(
        path.join(__dirname)
    )
);

app.get(
    "/",
    function (
        request,
        response
    ) {
        return response.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );
    }
);

/* ==========================================
   API not-found handler
========================================== */

app.use(
    "/api",
    function (
        request,
        response
    ) {
        return response
            .status(404)
            .json({
                error:
                    "API route not found."
            });
    }
);

/* ==========================================
   General error handler
========================================== */

app.use(
    function (
        error,
        request,
        response,
        next
    ) {
        console.error(
            "Unhandled server error:",
            error
        );

        if (
            response.headersSent
        ) {
            return next(error);
        }

        return response
            .status(500)
            .json({
                error:
                    "Unexpected server error."
            });
    }
);

/* ==========================================
   Start server
========================================== */

app.listen(
    PORT,
    "0.0.0.0",
    function () {
        console.log(
            ""
        );

        console.log(
            "PiHub Ambient running"
        );

        console.log(
            "Local:"
        );

        console.log(
            "http://127.0.0.1:" +
                PORT
        );

        console.log(
            ""
        );

        console.log(
            "Calendar configured:",
            Boolean(
                CALENDAR_ICS_URL
            )
        );

        console.log(
            "Spotify configured:",
            spotifyConfigured()
        );

        console.log(
            ""
        );
    }
);