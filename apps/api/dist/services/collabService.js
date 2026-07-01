"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTripAccess = exports.avatarUrl = void 0;
exports.loadReactions = loadReactions;
exports.groupReactions = groupReactions;
exports.addOrRemoveReaction = addOrRemoveReaction;
exports.formatNote = formatNote;
exports.listNotes = listNotes;
exports.createNote = createNote;
exports.updateNote = updateNote;
exports.deleteNote = deleteNote;
exports.addNoteFile = addNoteFile;
exports.getFormattedNoteById = getFormattedNoteById;
exports.deleteNoteFile = deleteNoteFile;
exports.getPollWithVotes = getPollWithVotes;
exports.listPolls = listPolls;
exports.createPoll = createPoll;
exports.votePoll = votePoll;
exports.closePoll = closePoll;
exports.deletePoll = deletePoll;
exports.formatMessage = formatMessage;
exports.countMessages = countMessages;
exports.listMessages = listMessages;
exports.createMessage = createMessage;
exports.deleteMessage = deleteMessage;
exports.fetchLinkPreview = fetchLinkPreview;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("../db/database");
const ssrfGuard_1 = require("../utils/ssrfGuard");
const avatarUrl_1 = require("./avatarUrl");
Object.defineProperty(exports, "avatarUrl", { enumerable: true, get: function () { return avatarUrl_1.avatarUrl; } });
var tripAccess_1 = require("./tripAccess");
Object.defineProperty(exports, "verifyTripAccess", { enumerable: true, get: function () { return tripAccess_1.verifyTripAccess; } });
/* ------------------------------------------------------------------ */
/*  Reactions                                                          */
/* ------------------------------------------------------------------ */
function loadReactions(messageId) {
    return database_1.db.prepare(`
    SELECT r.emoji, r.user_id, u.username
    FROM collab_message_reactions r
    JOIN users u ON r.user_id = u.id
    WHERE r.message_id = ?
  `).all(messageId);
}
function groupReactions(reactions) {
    const map = {};
    for (const r of reactions) {
        if (!map[r.emoji])
            map[r.emoji] = [];
        map[r.emoji].push({ user_id: r.user_id, username: r.username });
    }
    return Object.entries(map).map(([emoji, users]) => ({ emoji, users, count: users.length }));
}
function addOrRemoveReaction(messageId, tripId, userId, emoji) {
    const msg = database_1.db.prepare('SELECT id FROM collab_messages WHERE id = ? AND trip_id = ?').get(messageId, tripId);
    if (!msg)
        return { found: false, reactions: [] };
    const existing = database_1.db.prepare('SELECT id FROM collab_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(messageId, userId, emoji);
    if (existing) {
        database_1.db.prepare('DELETE FROM collab_message_reactions WHERE id = ?').run(existing.id);
    }
    else {
        database_1.db.prepare('INSERT INTO collab_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(messageId, userId, emoji);
    }
    return { found: true, reactions: groupReactions(loadReactions(messageId)) };
}
/* ------------------------------------------------------------------ */
/*  Notes                                                              */
/* ------------------------------------------------------------------ */
function formatNote(note) {
    const attachments = database_1.db.prepare('SELECT id, filename, original_name, file_size, mime_type FROM trip_files WHERE note_id = ?').all(note.id);
    return {
        ...note,
        avatar_url: (0, avatarUrl_1.avatarUrl)(note),
        attachments: attachments.map(a => ({ ...a, url: `/api/trips/${note.trip_id}/files/${a.id}/download` })),
    };
}
function listNotes(tripId) {
    const notes = database_1.db.prepare(`
    SELECT n.*, u.username, u.avatar
    FROM collab_notes n
    JOIN users u ON n.user_id = u.id
    WHERE n.trip_id = ?
    ORDER BY n.pinned DESC, n.updated_at DESC
  `).all(tripId);
    return notes.map(formatNote);
}
function createNote(tripId, userId, data) {
    const pinned = data.pinned ? 1 : 0;
    const result = database_1.db.prepare(`
    INSERT INTO collab_notes (trip_id, user_id, title, content, category, color, website, pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tripId, userId, data.title, data.content || null, data.category || 'General', data.color || '#6366f1', data.website || null, pinned);
    const note = database_1.db.prepare(`
    SELECT n.*, u.username, u.avatar FROM collab_notes n JOIN users u ON n.user_id = u.id WHERE n.id = ?
  `).get(result.lastInsertRowid);
    return formatNote(note);
}
function updateNote(tripId, noteId, data) {
    const existing = database_1.db.prepare('SELECT * FROM collab_notes WHERE id = ? AND trip_id = ?').get(noteId, tripId);
    if (!existing)
        return null;
    database_1.db.prepare(`
    UPDATE collab_notes SET
      title = COALESCE(?, title),
      content = CASE WHEN ? THEN ? ELSE content END,
      category = COALESCE(?, category),
      color = COALESCE(?, color),
      pinned = CASE WHEN ? IS NOT NULL THEN ? ELSE pinned END,
      website = CASE WHEN ? THEN ? ELSE website END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(data.title || null, data.content !== undefined ? 1 : 0, data.content !== undefined ? data.content : null, data.category || null, data.color || null, data.pinned !== undefined ? 1 : null, data.pinned ? 1 : 0, data.website !== undefined ? 1 : 0, data.website !== undefined ? data.website : null, noteId);
    const note = database_1.db.prepare(`
    SELECT n.*, u.username, u.avatar FROM collab_notes n JOIN users u ON n.user_id = u.id WHERE n.id = ?
  `).get(noteId);
    return formatNote(note);
}
function deleteNote(tripId, noteId) {
    const existing = database_1.db.prepare('SELECT id FROM collab_notes WHERE id = ? AND trip_id = ?').get(noteId, tripId);
    if (!existing)
        return false;
    // Clean up attached files from disk
    const noteFiles = database_1.db.prepare('SELECT id, filename FROM trip_files WHERE note_id = ?').all(noteId);
    for (const f of noteFiles) {
        const filePath = path_1.default.join(__dirname, '../../uploads', f.filename);
        try {
            fs_1.default.unlinkSync(filePath);
        }
        catch { /* ignore */ }
    }
    database_1.db.prepare('DELETE FROM trip_files WHERE note_id = ?').run(noteId);
    database_1.db.prepare('DELETE FROM collab_notes WHERE id = ?').run(noteId);
    return true;
}
/* ------------------------------------------------------------------ */
/*  Note files                                                         */
/* ------------------------------------------------------------------ */
function addNoteFile(tripId, noteId, file) {
    const note = database_1.db.prepare('SELECT id FROM collab_notes WHERE id = ? AND trip_id = ?').get(noteId, tripId);
    if (!note)
        return null;
    const result = database_1.db.prepare('INSERT INTO trip_files (trip_id, note_id, filename, original_name, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)').run(tripId, noteId, `files/${file.filename}`, file.originalname, file.size, file.mimetype);
    const saved = database_1.db.prepare('SELECT * FROM trip_files WHERE id = ?').get(result.lastInsertRowid);
    return { file: { ...saved, url: `/api/trips/${tripId}/files/${saved.id}/download` } };
}
function getFormattedNoteById(noteId) {
    const note = database_1.db.prepare('SELECT n.*, u.username, u.avatar FROM collab_notes n JOIN users u ON n.user_id = u.id WHERE n.id = ?').get(noteId);
    return formatNote(note);
}
function deleteNoteFile(noteId, fileId) {
    const file = database_1.db.prepare('SELECT * FROM trip_files WHERE id = ? AND note_id = ?').get(fileId, noteId);
    if (!file)
        return false;
    const filePath = path_1.default.join(__dirname, '../../uploads', file.filename);
    try {
        fs_1.default.unlinkSync(filePath);
    }
    catch { /* ignore */ }
    database_1.db.prepare('DELETE FROM trip_files WHERE id = ?').run(fileId);
    return true;
}
/* ------------------------------------------------------------------ */
/*  Polls                                                              */
/* ------------------------------------------------------------------ */
function getPollWithVotes(pollId) {
    const poll = database_1.db.prepare(`
    SELECT p.*, u.username, u.avatar
    FROM collab_polls p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(pollId);
    if (!poll)
        return null;
    const options = JSON.parse(poll.options);
    const votes = database_1.db.prepare(`
    SELECT v.option_index, v.user_id, u.username, u.avatar
    FROM collab_poll_votes v
    JOIN users u ON v.user_id = u.id
    WHERE v.poll_id = ?
  `).all(pollId);
    const formattedOptions = options.map((label, idx) => {
        const text = typeof label === 'string' ? label : label.label || label;
        return {
            // The client renders `opt.text`; keep `label` too for any other consumer.
            text,
            label: text,
            voters: votes
                .filter(v => v.option_index === idx)
                .map(v => ({ id: v.user_id, user_id: v.user_id, username: v.username, avatar: v.avatar, avatar_url: (0, avatarUrl_1.avatarUrl)(v) })),
        };
    });
    return {
        ...poll,
        avatar_url: (0, avatarUrl_1.avatarUrl)(poll),
        options: formattedOptions,
        is_closed: !!poll.closed,
        multiple_choice: !!poll.multiple,
    };
}
function listPolls(tripId) {
    const rows = database_1.db.prepare(`
    SELECT id FROM collab_polls WHERE trip_id = ? ORDER BY created_at DESC
  `).all(tripId);
    return rows.map(row => getPollWithVotes(row.id)).filter(Boolean);
}
function createPoll(tripId, userId, data) {
    const isMultiple = data.multiple || data.multiple_choice;
    const result = database_1.db.prepare(`
    INSERT INTO collab_polls (trip_id, user_id, question, options, multiple, deadline)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tripId, userId, data.question, JSON.stringify(data.options), isMultiple ? 1 : 0, data.deadline || null);
    return getPollWithVotes(result.lastInsertRowid);
}
function votePoll(tripId, pollId, userId, optionIndex) {
    const poll = database_1.db.prepare('SELECT * FROM collab_polls WHERE id = ? AND trip_id = ?').get(pollId, tripId);
    if (!poll)
        return { error: 'not_found' };
    if (poll.closed)
        return { error: 'closed' };
    const options = JSON.parse(poll.options);
    if (optionIndex < 0 || optionIndex >= options.length) {
        return { error: 'invalid_index' };
    }
    const existingVote = database_1.db.prepare('SELECT id FROM collab_poll_votes WHERE poll_id = ? AND user_id = ? AND option_index = ?').get(pollId, userId, optionIndex);
    if (existingVote) {
        database_1.db.prepare('DELETE FROM collab_poll_votes WHERE id = ?').run(existingVote.id);
    }
    else {
        if (!poll.multiple) {
            database_1.db.prepare('DELETE FROM collab_poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
        }
        database_1.db.prepare('INSERT INTO collab_poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)').run(pollId, userId, optionIndex);
    }
    return { poll: getPollWithVotes(pollId) };
}
function closePoll(tripId, pollId) {
    const poll = database_1.db.prepare('SELECT * FROM collab_polls WHERE id = ? AND trip_id = ?').get(pollId, tripId);
    if (!poll)
        return null;
    database_1.db.prepare('UPDATE collab_polls SET closed = 1 WHERE id = ?').run(pollId);
    return getPollWithVotes(pollId);
}
function deletePoll(tripId, pollId) {
    const poll = database_1.db.prepare('SELECT id FROM collab_polls WHERE id = ? AND trip_id = ?').get(pollId, tripId);
    if (!poll)
        return false;
    database_1.db.prepare('DELETE FROM collab_polls WHERE id = ?').run(pollId);
    return true;
}
/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
function formatMessage(msg, reactions) {
    return { ...msg, user_avatar: (0, avatarUrl_1.avatarUrl)(msg), avatar_url: (0, avatarUrl_1.avatarUrl)(msg), reactions: reactions || [] };
}
function countMessages(tripId) {
    const row = database_1.db.prepare('SELECT COUNT(*) as cnt FROM collab_messages WHERE trip_id = ?').get(tripId);
    return row.cnt;
}
function listMessages(tripId, before) {
    const query = `
    SELECT m.*, u.username, u.avatar,
      rm.text AS reply_text, ru.username AS reply_username
    FROM collab_messages m
    JOIN users u ON m.user_id = u.id
    LEFT JOIN collab_messages rm ON m.reply_to = rm.id
    LEFT JOIN users ru ON rm.user_id = ru.id
    WHERE m.trip_id = ?${before ? ' AND m.id < ?' : ''}
    ORDER BY m.id DESC
    LIMIT 100
  `;
    const messages = before
        ? database_1.db.prepare(query).all(tripId, before)
        : database_1.db.prepare(query).all(tripId);
    messages.reverse();
    const msgIds = messages.map(m => m.id);
    const reactionsByMsg = {};
    if (msgIds.length > 0) {
        const allReactions = database_1.db.prepare(`
      SELECT r.message_id, r.emoji, r.user_id, u.username
      FROM collab_message_reactions r
      JOIN users u ON r.user_id = u.id
      WHERE r.message_id IN (${msgIds.map(() => '?').join(',')})
    `).all(...msgIds);
        for (const r of allReactions) {
            if (!reactionsByMsg[r.message_id])
                reactionsByMsg[r.message_id] = [];
            reactionsByMsg[r.message_id].push(r);
        }
    }
    return messages.map(m => formatMessage(m, groupReactions(reactionsByMsg[m.id] || [])));
}
function createMessage(tripId, userId, text, replyTo) {
    if (replyTo) {
        const replyMsg = database_1.db.prepare('SELECT id FROM collab_messages WHERE id = ? AND trip_id = ?').get(replyTo, tripId);
        if (!replyMsg)
            return { error: 'reply_not_found' };
    }
    const result = database_1.db.prepare(`
    INSERT INTO collab_messages (trip_id, user_id, text, reply_to) VALUES (?, ?, ?, ?)
  `).run(tripId, userId, text.trim(), replyTo || null);
    const message = database_1.db.prepare(`
    SELECT m.*, u.username, u.avatar,
      rm.text AS reply_text, ru.username AS reply_username
    FROM collab_messages m
    JOIN users u ON m.user_id = u.id
    LEFT JOIN collab_messages rm ON m.reply_to = rm.id
    LEFT JOIN users ru ON rm.user_id = ru.id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);
    return { message: formatMessage(message) };
}
function deleteMessage(tripId, messageId, userId) {
    const message = database_1.db.prepare('SELECT * FROM collab_messages WHERE id = ? AND trip_id = ?').get(messageId, tripId);
    if (!message)
        return { error: 'not_found' };
    if (Number(message.user_id) !== Number(userId))
        return { error: 'not_owner' };
    database_1.db.prepare('UPDATE collab_messages SET deleted = 1 WHERE id = ?').run(messageId);
    return { username: message.username };
}
/* ------------------------------------------------------------------ */
/*  Link preview                                                       */
/* ------------------------------------------------------------------ */
async function fetchLinkPreview(url) {
    const fallback = { title: null, description: null, image: null, url };
    const parsed = new URL(url);
    const ssrf = await (0, ssrfGuard_1.checkSsrf)(url, true);
    if (!ssrf.allowed) {
        return { ...fallback, error: ssrf.error };
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const r = await fetch(url, {
                redirect: 'error',
                signal: controller.signal,
                dispatcher: (0, ssrfGuard_1.createPinnedDispatcher)(ssrf.resolvedIp),
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NOMAD/1.0; +https://github.com/mauriceboe/NOMAD)' },
            });
            clearTimeout(timeout);
            if (!r.ok)
                throw new Error('Fetch failed');
            const html = await r.text();
            const get = (prop) => {
                const m = html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']*)["']`, 'i'))
                    || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${prop}["']`, 'i'));
                return m ? m[1] : null;
            };
            const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
            const descMeta = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
                || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
            return {
                title: get('title') || (titleTag ? titleTag[1].trim() : null),
                description: get('description') || (descMeta ? descMeta[1].trim() : null),
                image: get('image') || null,
                site_name: get('site_name') || null,
                url,
            };
        }
        catch {
            clearTimeout(timeout);
            return fallback;
        }
    }
    catch {
        return fallback;
    }
}
