#!/usr/bin/env python3
"""Writes database.rules.json (Firebase Realtime Database security rules).

    python3 tools/rules.py

The rules are kept here, in Python, because the expressions are long and repeat; the JSON
file is what gets pasted into Firebase console -> Realtime Database -> Rules -> Publish.

Who can do what:
- The admin panel's account (ADMIN_EMAIL) and admins/{uid} = true: full read and write.
- Everyone (even before signing in): the public content (news, polls, forest, ...), a few
  counters that only go up by one, error reports, device pings.
- A signed-in student: their own records, plus the shared ones under conditions (chats only
  between the two people, friend requests only from the sender, ...).
- Points and balance can't be raised freely (see POINTS and BALANCE below); spending is fine.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# the admin panel's own account (admin.html signs in to it with the panel password), plus
# anyone listed in admins/{uid}
ADMIN_EMAIL = 'panel.admin@iraqi-student-platform.app'
ADMIN = f"(auth != null && (auth.token.email === '{ADMIN_EMAIL}' || root.child('admins/' + auth.uid).val() === true))"
SIGNED = "auth != null"
OWNER = "(auth != null && auth.uid == $uid)"
NEW = "newData.parent().parent().parent()"  # the database root after the write, from users/$uid/x


def ors(*parts):
    return '(' + ' || '.join(parts) + ')'


def ands(*parts):
    return '(' + ' && '.join(parts) + ')'


def s_max(path, n):
    """newData is a string no longer than n."""
    return f"{path}.isString() && {path}.val().length <= {n}"


def counter(step_max=1):
    """A number that only goes up, by at most step_max per write."""
    return ors(ADMIN, f"newData.isNumber() && newData.val() >= (data.exists() ? data.val() : 0) && newData.val() <= (data.exists() ? data.val() : 0) + {step_max}")


# ---------- points ----------
# users/{uid}/points may: start at 0, go down, go up by at most 200 when users/{uid}/pAt moves on
# by at least 20 seconds (and pAt can't be set in the future or moved back), or go up by an
# auction refund claimed in the same write (users/{uid}/pc names it, and it is marked claimed).
PC = "newData.parent().child('pc').val()"
POINTS_CLAIM = ands(
    "newData.parent().child('pc').isString()",
    PC + ".matches(/^auctionBids\\/[A-Za-z0-9_-]+\\/refunds\\/[A-Za-z0-9_-]+\\/[0-9]+$/)",
    PC + ".contains('/refunds/' + $uid + '/')",
    f"root.child({PC}).exists()",
    f"root.child({PC} + '/c').val() != true",
    f"{NEW}.child({PC} + '/c').val() == true",
    f"newData.val() - (data.exists() ? data.val() : 0) <= root.child({PC} + '/amount').val()",
)
POINTS = ands(
    "newData.isNumber()", "newData.val() >= 0", "newData.val() <= 1000000000",
    ors(
        ADMIN,
        "!data.exists() && newData.val() <= 200",
        "data.exists() && newData.val() <= data.val()",
        ands("data.exists()", "newData.val() - data.val() <= 200",
             "newData.parent().child('pAt').isNumber()",
             "newData.parent().child('pAt').val() >= (data.parent().child('pAt').exists() ? data.parent().child('pAt').val() + 20000 : 0)"),
        POINTS_CLAIM,
    ),
)
PAT = ors(ADMIN, "newData.isNumber() && newData.val() <= now + 10000 && (!data.exists() || newData.val() >= data.val())")

# ---------- balance ----------
# users/{uid}/balance may: start at 0, go down, or go up by
# - a top-up code marked used by this account in the same write (bt names the code),
# - an incoming transfer marked claimed in the same write (bi names it),
# - points paid in the same write (10 points = 1 IQD, 1325 IQD = $1; ps names the spend).
BT = "newData.parent().child('bt').val()"
BI = "newData.parent().child('bi').val()"
BAL_TOPUP = ands(
    "data.exists()", "newData.parent().child('bt').isString()",
    f"root.child('topupCodes/' + {BT}).exists()",
    f"root.child('topupCodes/' + {BT} + '/used').val() != true",
    f"{NEW}.child('topupCodes/' + {BT} + '/used').val() == true",
    f"{NEW}.child('topupCodes/' + {BT} + '/usedBy').val() == $uid",
    f"newData.val() - data.val() <= root.child('topupCodes/' + {BT} + '/value').val() / 1325 + 0.01",
)
BAL_IN = ands(
    "data.exists()", "newData.parent().child('bi').isString()",
    f"root.child('incoming/' + $uid + '/' + {BI} + '/claimed').val() == false",
    f"{NEW}.child('incoming/' + $uid + '/' + {BI} + '/claimed').val() == true",
    f"newData.val() - data.val() <= root.child('incoming/' + $uid + '/' + {BI} + '/amount').val() + 0.001",
)
P_OLD, P_NEW = "data.parent().child('points').val()", "newData.parent().child('points').val()"
BAL_REDEEM = ands(
    "data.exists()", "data.parent().child('points').isNumber()", "newData.parent().child('points').isNumber()",
    "newData.parent().child('ps').isString()", "newData.parent().child('ps').val().beginsWith('r:')",
    "newData.parent().child('ps').val() != data.parent().child('ps').val()",
    f"{P_OLD} - {P_NEW} >= 1000",
    f"(newData.val() - data.val()) * 13250 <= ({P_OLD} - {P_NEW}) * 1.02",
)
BALANCE = ands(
    "newData.isNumber()", "newData.val() >= 0", "newData.val() <= 100000",
    ors(ADMIN, "!data.exists() && newData.val() == 0", "data.exists() && newData.val() <= data.val()", BAL_TOPUP, BAL_IN, BAL_REDEEM),
)

# points paid by the writer in this write, seen from a node two levels under the root
def paid(amount_expr, spend_expr, up=2):
    new_root = '.'.join(['newData'] + ['parent()'] * up)
    return ands(
        f"root.child('users/' + auth.uid + '/points').isNumber()",
        f"{new_root}.child('users/' + auth.uid + '/points').val() <= root.child('users/' + auth.uid + '/points').val() - ({amount_expr})",
        f"{new_root}.child('users/' + auth.uid + '/ps').val() == {spend_expr}",
        f"root.child('users/' + auth.uid + '/ps').val() != {spend_expr}",
    )


def own_write(extra=None):
    return {".write": ors(OWNER, ADMIN)} if extra is None else {".write": ors(ands(OWNER, extra), ADMIN)}


public_admin = {".read": True, ".write": ADMIN}
# one of the two people in a chat (chat ids are the two uids, sorted, joined by _)
CHAT_MEMBER = "(auth != null && ($chat.beginsWith(auth.uid + '_') || $chat.endsWith('_' + auth.uid)))"

# the 19 governorates, as a rules regular expression
GOV_RE = "/^(بغداد|البصرة|نينوى|أربيل|السليمانية|دهوك|حلبجة|كركوك|الأنبار|صلاح الدين|ديالى|بابل|كربلاء|النجف|واسط|القادسية|ذي قار|ميسان|المثنى)$/"

# فضفضة: words refused even from a tampered app (the app's own filter is much wider)
VENT_BAD = "/.*(شرموط|قحب|منيوك|منيوج|كسمك|كس امك|كسختك|طيزك|طيزه|سكس|نيكني|نياك|xnxx|porn|fuck|pussy|sharmoot|sharmout).*/i"
VENT_OK_USER = "root.child('ventBan/' + auth.uid).val() != true"

# a study place (spots/{id} and spotsPending/{id})
SPOT_OK = "(" + " && ".join([
    "newData.hasChildren(['n', 't', 'g', 'lat', 'lng', 'by', 'at'])",
    "newData.child('lat').isNumber()", "newData.child('lat').val() >= 29", "newData.child('lat').val() <= 37.5",
    "newData.child('lng').isNumber()", "newData.child('lng').val() >= 38.5", "newData.child('lng').val() <= 48.8",
    "newData.child('at').isNumber()",
]) + ")"
SPOT_FIELDS = {
    "n": {".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 60"},
    "t": {".validate": "newData.isString() && newData.val().matches(/^(lib|cafe|hall|uni|other)$/)"},
    "g": {".validate": "newData.isString() && newData.val().matches(" + GOV_RE + ")"},
    "addr": {".validate": "newData.isString() && newData.val().length <= 150"},
    "price": {".validate": "newData.isString() && newData.val().length <= 40"},
    "ph": {".validate": "newData.isString() && newData.val().matches(/^[+]?[0-9]{7,15}$/)"},
    "sex": {".validate": "newData.isString() && newData.val().matches(/^(m|f|all)$/)"},
    "img": {".validate": "newData.isString() && newData.val().length <= 80000"},
    "by": {".validate": "newData.isString() && newData.val().length <= 128"},
    "h": {"o": {".validate": "newData.isString() && newData.val().matches(/^[0-2][0-9]:[0-5][0-9]$/)"},
          "c": {".validate": "newData.isString() && newData.val().matches(/^[0-2][0-9]:[0-5][0-9]$/)"},
          "a24": {".validate": "newData.isBoolean()"}, "fri": {".validate": "newData.isBoolean()"},
          "$other": {".validate": False}},
    "f": {"$k": {".validate": "newData.isBoolean() && $k.matches(/^(wifi|power|ac|coffee|free|quiet)$/)"}},
    "feat": {".validate": "newData.isBoolean()"},
}
SPOT = dict({".validate": SPOT_OK}, **SPOT_FIELDS)

# YouTube rooms, from a node under ytRooms/$rid
YR_HOST = "(auth != null && root.child('ytRooms/' + $rid + '/meta/host').val() == auth.uid)"
YR_MEMBER = "root.child('ytRooms/' + $rid + '/members/' + auth.uid).exists()"
YR_MEMBER_NEW = "newData.parent().parent().child('members/' + auth.uid).exists()"
signed_admin = {".read": SIGNED, ".write": ADMIN}

rules = {
    ".read": ADMIN,
    ".write": ADMIN,

    "admins": {
        ".read": SIGNED,
        "$uid": {".write": ADMIN},
    },

    # ----- content published from the admin panel -----
    **{k: public_admin for k in ["news", "resources", "notifications", "ticker", "siteConfig", "settings",
                                  "carousel", "holidays", "examSchedule", "dayStatus", "verified",
                                  "forestConfig", "govWarConfig", "auctionHistory", "admission", "voiceNote", "voiceNoteAudio"]},
    # big files (PDFs) live apart from the lists so opening the app never downloads them
    "resourceFiles": {
        ".read": True, ".write": ADMIN,
        "$id": {".validate": "newData.isString() && newData.val().length < 10000000"},
    },
    "bannedStudents": signed_admin,
    # bans by account, and the phones that account used (an id the app keeps on the phone); a
    # banned student's own app reports its phone, so a new account there is refused too
    "bannedUsers": {"$uid": {".read": ors(OWNER, ADMIN), ".write": ADMIN}},
    "bannedDevices": {
        "$d": {
            ".read": True,
            ".write": ors(ADMIN, ands(SIGNED, "root.child('bannedUsers/' + auth.uid).exists()", "!data.exists()", "newData.child('uid').val() == auth.uid")),
            ".validate": "!newData.exists() || ($d.matches(/^[a-z0-9]{16,40}$/) && newData.child('uid').isString())",
        },
    },
    # one account per phone: the first account signed in on a phone owns it (the panel can free it)
    "deviceOwners": {
        "$d": {
            ".read": True,
            ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.val() == auth.uid"),
                          # freed by its owner only once their account is deleted (حذف حسابي)
                          ands(SIGNED, "!newData.exists()", "data.val() == auth.uid", "!root.child('users/' + auth.uid).exists()")),
            ".validate": "!newData.exists() || ($d.matches(/^[a-z0-9]{16,40}$/) && newData.isString())",
        },
    },
    # voice note counters (anyone, one step at a time) and who listened (signed-in, own row; admin reads)
    "voiceNoteStats": {".read": True, "$id": {"plays": {".write": True, ".validate": counter()}, "done": {".write": True, ".validate": counter()}}},
    "voiceListeners": {".read": ADMIN, "$id": {"$uid": {".write": OWNER, ".validate": s_max("newData.child('n')", 60) + " && newData.child('at').isNumber()"}}},

    # ----- students -----
    # a student's full record (email, phone, balance, grades, phones used) is theirs and the
    # panel's only; others find them through pub and numIndex below
    "users": {
        "$uid": {
            ".read": OWNER,
            # deleting the whole account (حذف حسابي); single fields keep their own rules below
            ".write": ands(OWNER, "!newData.exists()"),
            # each field is written on its own (update), so a student can't delete points/balance
            "points": {".write": ors(ands(OWNER, "newData.exists()"), ADMIN), ".validate": POINTS},
            "balance": {".write": ors(ands(OWNER, "newData.exists()"), ADMIN), ".validate": BALANCE},
            "pAt": {".write": ors(ands(OWNER, "newData.exists()"), ADMIN), ".validate": PAT},
            "pc": {".write": ors(OWNER, ADMIN), ".validate": s_max('newData', 200)},
            "ps": {".write": ors(OWNER, ADMIN), ".validate": s_max('newData', 120)},
            "bs": {".write": ors(OWNER, ADMIN), ".validate": s_max('newData', 60)},
            "bt": {".write": ors(OWNER, ADMIN), ".validate": "newData.isString() && newData.val().matches(/^[A-Z0-9-]{4,24}$/)"},
            "bi": {".write": ors(OWNER, ADMIN), ".validate": "newData.isString() && newData.val().matches(/^tr_[0-9]+_[0-9]+$/)"},
            "$field": {".write": ors(OWNER, ADMIN)},
        },
    },
    # the public directory: name, student number, governorate (for search, friends, transfers)
    "pub": {
        ".read": SIGNED,
        "$uid": {
            ".write": ors(OWNER, ADMIN),
            ".validate": "!newData.exists() || (" + ands(s_max("newData.child('n')", 80), "(!newData.child('s').exists() || " + s_max("newData.child('s')", 12) + ")", "(!newData.child('g').exists() || " + s_max("newData.child('g')", 30) + ")", "(!newData.child('p').exists() || (" + s_max("newData.child('p')", 600) + " && newData.child('p').val().beginsWith('https://')))") + ")",
        },
    },
    # قاعة الهمّة: who is in the hall now (name, governorate, a small photo, when they came in)
    "hall": {
        ".read": SIGNED,
        "$uid": {
            ".write": ors(OWNER, ADMIN),
            ".validate": "!newData.exists() || (" + ands("newData.hasChildren(['n', 'at'])", s_max("newData.child('n')", 80), "(!newData.child('g').exists() || " + s_max("newData.child('g')", 30) + ")", "(!newData.child('a').exists() || " + s_max("newData.child('a')", 8000) + ")", "newData.child('at').isNumber()", "newData.child('at').val() <= now + 60000", "newData.child('at').val() >= now - 86400000", "!newData.child('x').exists()") + ")",
        },
    },
    # student number -> uid, claimed once by its owner
    "numIndex": {
        "$n": {
            ".read": SIGNED,
            ".write": ors(ADMIN, ands(SIGNED, "(!data.exists() || data.val() == auth.uid)", "(!newData.exists() || newData.val() == auth.uid)")),
            ".validate": "!newData.exists() || ($n.matches(/^[0-9]{3,12}$/) && newData.isString())",
        },
    },
    "leaderboard": {
        ".read": True,
        "$uid": {
            ".write": ors(OWNER, ADMIN),
            "points": {".validate": ors(ADMIN, "newData.isNumber() && newData.val() == newData.parent().parent().parent().child('users/' + $uid + '/points').val()")},
        },
    },
    "phoneIndex": {
        "$p": {
            ".read": True,
            ".write": ors(ands(SIGNED, "(!data.exists() || data.child('u').val() == auth.uid)", "(!newData.exists() || newData.child('u').val() == auth.uid)"), ADMIN),
            ".validate": "newData.hasChildren(['e', 'u']) && newData.child('e').isString() && newData.child('e').val().length <= 120",
        },
    },
    **{k: {"$uid": {".read": OWNER, ".write": ors(OWNER, ADMIN)}} for k in
       ["userNewsState", "userTasks", "userActivity", "tokens", "walletTransactions", "chatClearedAt", "userCards"]},
    # reactions on news: each student keeps their own choice, and the public counters may only move by one,
    # together with that student's own choice changing (the same update), so nobody can inflate a number
    "userNewsReact": {"$uid": {".read": OWNER, "$n": {
        ".write": ors(OWNER, ADMIN),
        ".validate": "!newData.exists() || (newData.isString() && newData.val().matches(/^(like|love|laugh|sad|angry)$/))",
    }}},
    "newsReactCounts": {
        ".read": True,
        "$n": {"$t": {
            ".write": ors(ADMIN, ands(SIGNED, ors(
                ands("newData.val() == (data.exists() ? data.val() : 0) + 1",
                     "newData.parent().parent().parent().child('userNewsReact').child(auth.uid).child($n).val() == $t",
                     "root.child('userNewsReact').child(auth.uid).child($n).val() != $t",
                     # switching from another reaction: that one's counter goes down by one in the same update
                     "(!root.child('userNewsReact').child(auth.uid).child($n).exists() || newData.parent().child(root.child('userNewsReact').child(auth.uid).child($n).val()).val() == root.child('newsReactCounts').child($n).child(root.child('userNewsReact').child(auth.uid).child($n).val()).val() - 1)"),
                ands("data.exists()", "newData.val() == data.val() - 1",
                     "root.child('userNewsReact').child(auth.uid).child($n).val() == $t",
                     "newData.parent().parent().parent().child('userNewsReact').child(auth.uid).child($n).val() != $t")))),
            ".validate": "$t.matches(/^(like|love|laugh|sad|angry)$/) && newData.isNumber() && newData.val() >= 0",
        }},
    },
    # the challenger also lists the duel for the other player
    "userDuels": {"$uid": {".read": OWNER, ".write": ors(OWNER, ADMIN), "$id": {".write": "auth != null && root.child('duels/' + $id + '/player1Uid').val() == auth.uid"}}},
    "presence": {".read": SIGNED, "$uid": {".write": ors(OWNER, ADMIN)}},
    # which chat a student has open right now: only the person they are chatting with (and they themselves) can read it,
    # so the server can skip the phone notification for a message that is being read live
    "chatNow": {"$uid": {".read": "auth != null && (auth.uid == $uid || data.child('c').val() == auth.uid)", ".write": ors(OWNER, ADMIN), ".validate": "!newData.exists() || (newData.hasChildren(['c', 'at']) && " + s_max("newData.child('c')", 40) + " && newData.child('at').isNumber())"}},
    # listened to from the start, before signing in
    "studyRoom": {".read": True, "$uid": {".write": ors(OWNER, ADMIN)}},
    "focusLive": {".read": True, "$uid": {".read": True, ".write": ors(OWNER, ADMIN)}},
    "blockedUsers": {"$uid": {".read": OWNER, ".write": ors(OWNER, ADMIN), "$other": {".read": "auth != null && auth.uid == $other"}}},

    # ----- money -----
    "topupCodes": {
        "$code": {
            ".read": SIGNED,
            ".write": ors(ADMIN, ands(SIGNED, "data.exists()", "data.child('used').val() != true", "newData.child('used').val() == true",
                                      "newData.child('usedBy').val() == auth.uid", "newData.child('value').val() == data.child('value').val()")),
        },
    },
    "incoming": {
        "$to": {
            ".read": "auth != null && auth.uid == $to",
            "$tid": {
                ".write": ors(
                    ADMIN,
                    # the sender: new, from them, and their own balance goes down by the amount in the same write
                    ands(SIGNED, "!data.exists()", "$tid.matches(/^tr_[0-9]+_[0-9]+$/)", "auth.uid != $to",
                         "newData.child('from').val() == auth.uid", "newData.child('claimed').val() == false",
                         "newData.child('amount').isNumber()", "newData.child('amount').val() >= 0.01", "newData.child('amount').val() <= 100000",
                         "root.child('users/' + auth.uid + '/balance').isNumber()",
                         "newData.parent().parent().parent().child('users/' + auth.uid + '/balance').val() <= root.child('users/' + auth.uid + '/balance').val() - newData.child('amount').val() + 0.001",
                         "newData.parent().parent().parent().child('users/' + auth.uid + '/bs').val() == $tid"),
                    # the receiver: only marks it claimed (balance rule checks the credit)
                    ands("auth != null && auth.uid == $to", "data.exists()", "data.child('claimed').val() == false", "newData.child('claimed').val() == true",
                         "newData.child('amount').val() == data.child('amount').val()", "newData.child('from').val() == data.child('from').val()"),
                ),
            },
        },
    },
    "transfers": {"$tid": {".write": ors(ADMIN, "auth != null && !data.exists() && newData.child('from').val() == auth.uid")}},

    # ----- auction -----
    "auction": {".read": True, ".write": ADMIN,
                "current": {"endsAt": {".write": ors(ADMIN, ands(
                    SIGNED, "data.exists()", "newData.isNumber()", "newData.val() >= data.val()", "newData.val() <= now + 125000",
                    "root.child('auctionBids/' + root.child('auction/current/id').val() + '/top/uid').val() == auth.uid"))}}},
    "auctionBids": {
        ".read": True,
        "$id": {
            "top": {
                ".write": ors(ADMIN, ands(
                    SIGNED, "newData.child('uid').val() == auth.uid",
                    "root.child('auction/current/id').val() == $id", "now < root.child('auction/current/endsAt').val() + 5000",
                    "newData.child('amount').isNumber()", "newData.child('amount').val() % 1 === 0",
                    "newData.child('amount').val() >= (data.exists() ? data.child('amount').val() + 1 : 1)",
                    paid("newData.child('amount').val() - (data.child('uid').val() == auth.uid ? data.child('amount').val() : 0)",
                         "'a:' + $id + ':' + newData.child('amount').val()", up=3),
                    # whoever held the top bid gets their points back through a refund record
                    "(!data.exists() || data.child('uid').val() == auth.uid || newData.parent().child('refunds/' + data.child('uid').val() + '/' + data.child('amount').val() + '/amount').val() == data.child('amount').val())",
                )),
            },
            "refunds": {
                "$u": {
                    ".write": ors(ADMIN, "auth != null && auth.uid == $u && !newData.exists()"),
                    "$k": {
                        ".write": ors(
                            # created by the new top bidder for the one they replaced
                            ands(SIGNED, "!data.exists()", "auth.uid != $u",
                                 "root.child('auctionBids/' + $id + '/top/uid').val() == $u",
                                 "root.child('auctionBids/' + $id + '/top/amount').val() == newData.child('amount').val()",
                                 "$k == '' + newData.child('amount').val()",
                                 "newData.parent().parent().parent().child('top/uid').val() == auth.uid"),
                            # claimed once by its owner
                            ands("auth != null && auth.uid == $u", "data.exists()", "data.child('c').val() != true", "newData.child('c').val() == true",
                                 "newData.child('amount').val() == data.child('amount').val()"),
                        ),
                    },
                },
            },
            "log": {"$k": {".write": ors(ADMIN, "auth != null && !data.exists() && newData.child('uid').val() == auth.uid")}},
        },
    },

    # ----- the store: categories and products the admin publishes from the panel. A product's
    # small picture is inside it (shop/items); the full one is in shop/imgs, read when opened.
    "shop": {
        ".read": True,
        ".write": ADMIN,
        "cats": {"$id": {".validate": ands("newData.hasChildren(['n'])", s_max("newData.child('n')", 40), "newData.child('n').val().length > 0")}},
        "items": {"$id": {
            ".validate": ands("newData.hasChildren(['n', 'cat', 'img'])", s_max("newData.child('n')", 80), "newData.child('n').val().length > 0",
                              s_max("newData.child('cat')", 40), s_max("newData.child('img')", 400000)),
            "d": {".validate": s_max("newData", 800)},
            "price": {".validate": s_max("newData", 40)},
            "pd": {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000000"},
            "tt": {".validate": s_max("newData", 300) + " && newData.val().matches(/^https:\\/\\/([a-z0-9-]+\\.)?tiktok\\.com\\//)"},
            "buy": {".validate": s_max("newData", 300) + " && newData.val().matches(/^https:\\/\\//)"},
        }},
        "imgs": {"$id": {".validate": s_max("newData", 3000000)}},
        # points per dinar, for prices in points
        "rate": {".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 1000"},
    },
    # orders from the store's cart: the student writes a new one (paying in points in the same
    # write, or cash on delivery) and reads their own; only the admin changes them after that.
    # shopMine/{uid} lists a student's order ids.
    "shopOrders": {
        ".read": ADMIN,
        "$id": {
            ".read": ors(ADMIN, "auth != null && data.child('u').val() == auth.uid"),
            ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.child('u').val() == auth.uid")),
            ".validate": ors("data.exists()", ands(
                "newData.hasChildren(['u', 'name', 'phone', 'gov', 'addr', 'items', 'totalD', 'totalP', 'pay', 'st', 'at'])",
                "newData.child('st').val() == 'new'", "newData.child('at').val() == now",
                s_max("newData.child('name')", 60), s_max("newData.child('addr')", 300),
                "newData.child('phone').isString() && newData.child('phone').val().matches(/^[+]?[0-9]{10,15}$/)",
                "newData.child('gov').isString() && newData.child('gov').val().matches(" + GOV_RE + ")",
                "newData.child('totalD').isNumber() && newData.child('totalD').val() >= 0",
                "newData.child('totalP').isNumber() && newData.child('totalP').val() >= 0",
                ors(ands("newData.child('pay').val() == 'points'", "newData.child('totalP').val() > 0",
                         paid("newData.child('totalP').val()", "'s:' + $id")),
                    "newData.child('pay').val() == 'cash'"))),
            "st": {".validate": "newData.isString() && newData.val().matches(/^(new|prep|sent|done|cancel)$/)"},
            "note": {".validate": s_max("newData", 300)},
        },
    },
    "shopMine": {"$uid": {".read": OWNER, ".write": ands(OWNER, "!newData.exists()"), "$id": {".write": ors(ADMIN, ands(OWNER, "!data.exists()")), ".validate": "newData.val() === true"}}},

    # ----- store -----
    "stores": {".read": True, "$uid": {".write": ors(OWNER, ADMIN)}},
    "storeProducts": {
        ".read": True,
        "$id": {
            ".write": ors(ADMIN, "auth != null && (data.exists() ? data.child('ownerUid').val() == auth.uid : newData.child('ownerUid').val() == auth.uid)"),
            "likes": {"$uid": {".write": OWNER}},
        },
    },
    "storeOrders": {
        "$id": {".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.child('buyerUid').val() == auth.uid",
                                           "newData.child('totalPoints').isNumber()", "newData.child('totalPoints').val() > 0",
                                           paid("newData.child('totalPoints').val()", "'o:' + $id")))},
    },

    # ----- friends and chats -----
    "friendRequests": {
        "$to": {
            ".read": "auth != null && auth.uid == $to",
            "$from": {".write": ors(ADMIN, "auth != null && auth.uid == $from", "auth != null && auth.uid == $to && !newData.exists()")},
        },
    },
    "sentFriendRequests": {
        "$uid": {".read": OWNER, "$other": {".write": ors(OWNER, ADMIN, "auth != null && auth.uid == $other && !newData.exists()")}},
    },
    "friends": {
        "$uid": {
            ".read": OWNER,
            ".write": ands(OWNER, "!newData.exists()"),
            "$other": {".write": ors(OWNER, ADMIN,
                                    "auth != null && auth.uid == $other && !newData.exists()",
                                    "auth != null && auth.uid == $other && root.child('friendRequests/' + auth.uid + '/' + $uid).exists()")},
        },
    },
    "userChats": {
        "$uid": {".read": OWNER, ".write": ands(OWNER, "!newData.exists()"), "$other": {".write": ors(OWNER, ADMIN, "auth != null && auth.uid == $other")}},
    },
    # each of the two writes, edits and deletes only their own messages (no message in the other's
    # name), and only their own read receipt and "deleted for me" list
    "privateChats": {
        "$chat": {
            ".read": CHAT_MEMBER,
            ".write": ADMIN,
            "messages": {
                "$m": {
                    ".write": ands(CHAT_MEMBER, "(data.exists() ? data.child('from').val() == auth.uid : newData.child('from').val() == auth.uid)"),
                    ".validate": "!newData.exists() || (newData.child('from').val() == auth.uid || " + ADMIN + ")",
                },
            },
            "deletedFor": {"$uid": {".write": ands(CHAT_MEMBER, OWNER)}},
            "readReceipts": {"$uid": {".write": ands(CHAT_MEMBER, OWNER)}},
            "$other": {".write": CHAT_MEMBER},
        },
    },
    "reports": {"$id": {".write": ors(ADMIN, "auth != null && !data.exists() && newData.child('reporterUid').val() == auth.uid")}},

    # ----- duels and twins -----
    "duels": {
        ".read": SIGNED,
        "$id": {".write": ors(ADMIN, "auth != null && (data.exists() ? (data.child('player1Uid').val() == auth.uid || data.child('player2Uid').val() == auth.uid) : newData.child('player1Uid').val() == auth.uid)")},
    },
    "duelInvites": {
        "$uid": {".read": OWNER, "$id": {".write": ors(OWNER, ADMIN, "auth != null && (data.exists() ? data.child('fromUid').val() == auth.uid : newData.child('fromUid').val() == auth.uid)")}},
    },
    "twinQueue": {
        ".read": SIGNED,
        "$stage": {
            "$uid": {
                ".write": ors(OWNER, ADMIN, "auth != null && !newData.exists() && data.child('claimedBy').val() == auth.uid"),
                "claimedBy": {".write": "auth != null && (!data.exists() || data.val() == auth.uid) && (!newData.exists() || newData.val() == auth.uid)"},
            },
        },
    },
    "twinOf": {
        ".read": SIGNED,
        "$uid": {".write": ors(OWNER, ADMIN,
                              "auth != null && !data.exists() && newData.isString() && newData.parent().parent().child('twins/' + newData.val() + '/members/' + auth.uid).exists() && newData.parent().parent().child('twins/' + newData.val() + '/members/' + $uid).exists()",
                              "auth != null && !newData.exists() && root.child('twins/' + data.val() + '/members/' + auth.uid).exists()")},
    },
    "twins": {
        ".read": SIGNED,
        "$pid": {".write": ors(ADMIN, "auth != null && (data.exists() ? data.child('members/' + auth.uid).exists() : newData.child('members/' + auth.uid).exists())")},
    },
    # ----- YouTube study rooms: the host runs the room, each student writes only their own rows -----
    "ytRooms": {
        "$rid": {
            ".read": SIGNED,
            ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.child('meta/host').val() == auth.uid",
                                      "newData.child('members/' + auth.uid).exists()"), ands(YR_HOST, "!newData.exists()")),
            "meta": {
                ".write": YR_HOST,
                ".validate": ands("newData.child('host').val() == (data.exists() ? data.child('host').val() : auth.uid)",
                                  s_max("newData.child('title')", 60), "newData.child('at').isNumber()"),
                "cur": {".validate": "newData.isString() && newData.val().length <= 20"},
            },
            "queue": {"$k": {".write": YR_HOST, ".validate": "!newData.exists() || (" + s_max("newData.child('v')", 11) + " && newData.child('v').val().matches(/^[A-Za-z0-9_-]{11}$/))",
                             "t": {".validate": s_max("newData", 100)}}},
            "members": {"$uid": {
                ".write": ors(ADMIN, ands(OWNER, "root.child('ytRooms/' + $rid + '/meta').exists()", "!root.child('ytRooms/' + $rid + '/kicked/' + $uid).exists()"),
                              ands(YR_HOST, "!newData.exists()")),
                ".validate": "!newData.exists() || (" + s_max("newData.child('n')", 60) + ")",
            }},
            "kicked": {"$uid": {".write": YR_HOST}},
            "prog": {"$uid": {
                ".write": ors(ands(OWNER, YR_MEMBER_NEW), ands(YR_HOST, "!newData.exists()"), ands(OWNER, "!newData.exists()")),
                ".validate": "!newData.exists() || (newData.child('t').isNumber() && newData.child('d').isNumber() && newData.child('at').isNumber())",
            }},
            "done": {"$uid": {"$k": {".write": ands(OWNER, YR_MEMBER), ".validate": "newData.val() === true"}}},
            "react": {"$uid": {".write": ors(ands(OWNER, YR_MEMBER), ands(OWNER, "!newData.exists()"), ands(YR_HOST, "!newData.exists()")),
                               ".validate": "!newData.exists() || (" + s_max("newData.child('r')", 8) + " && newData.child('at').isNumber())"}},
            "chat": {"$id": {
                ".write": ors(ands(SIGNED, "!data.exists()", "newData.child('u').val() == auth.uid", YR_MEMBER),
                              ands(SIGNED, "!newData.exists()", ors("data.child('u').val() == auth.uid", YR_HOST))),
                ".validate": "!newData.exists() || (" + s_max("newData.child('m')", 200) + " && newData.child('at').isNumber())",
            }},
        },
    },
    "ytInvites": {
        "$to": {
            ".read": "auth != null && auth.uid == $to",
            "$rid": {".write": ors(ADMIN, "auth != null && auth.uid == $to && !newData.exists()",
                                   ands(SIGNED, "newData.child('from').val() == auth.uid", "root.child('ytRooms/' + $rid + '/members/' + auth.uid).exists()"))},
        },
    },
    # ----- voice calls in messages: the ring goes to the callee's box, the call's signalling
    # (offer/answer/network candidates, never the audio itself) sits under the pair's chat id -----
    "callRing": {
        "$to": {
            ".read": "auth != null && auth.uid == $to",
            "$from": {
                ".write": ors(ADMIN, ands("auth != null && auth.uid == $from", "$from != $to",
                                          "(!newData.exists() || !root.child('blockedUsers/' + $to + '/' + $from).exists())"),
                              "auth != null && auth.uid == $to && !newData.exists()"),
                ".validate": "!newData.exists() || (" + ands(s_max("newData.child('id')", 40), s_max("newData.child('n')", 60),
                                                            "newData.child('at').isNumber()", "newData.child('at').val() <= now + 60000") + ")",
                "a": {".validate": s_max("newData", 600)},
            },
        },
    },
    "calls": {
        "$chat": {
            ".read": "auth != null && ($chat.beginsWith(auth.uid + '_') || $chat.endsWith('_' + auth.uid))",
            ".write": ors(ADMIN, "auth != null && ($chat.beginsWith(auth.uid + '_') || $chat.endsWith('_' + auth.uid))"),
            ".validate": "!newData.exists() || (" + ands(s_max("newData.child('id')", 40), "newData.child('from').isString()", "newData.child('to').isString()",
                                                        "$chat == newData.child('from').val() + '_' + newData.child('to').val() || $chat == newData.child('to').val() + '_' + newData.child('from').val()") + ")",
            "offer": {"sdp": {".validate": s_max("newData", 20000)}},
            "answer": {"sdp": {".validate": s_max("newData", 20000)}},
            "oc": {"$k": {"candidate": {".validate": s_max("newData", 1000)}}},
            "ac": {"$k": {"candidate": {".validate": s_max("newData", 1000)}}},
        },
    },
    "voiceRoom": {
        "participants": {".read": SIGNED, "$uid": {".write": ors(OWNER, ADMIN)}},
        "calls": {"$uid": {".read": OWNER, ".write": ors(OWNER, ADMIN), "$other": {".read": "auth != null && auth.uid == $other", ".write": "auth != null && auth.uid == $other"}}},
    },

    # ----- forum -----
    "forumThreads": {
        ".read": True,
        "$id": {
            ".write": ors(ADMIN, "auth != null && (data.exists() ? data.child('authorUid').val() == auth.uid : newData.child('authorUid').val() == auth.uid)"),
            ".validate": "!newData.exists() || (" + ands(
                "(!newData.child('body').exists() || " + s_max("newData.child('body')", 3000) + ")",
                "(!newData.child('title').exists() || " + s_max("newData.child('title')", 150) + ")",
                "(!newData.child('imageUrl').exists() || " + s_max("newData.child('imageUrl')", 600000) + ")",
                "(!newData.child('subject').exists() || " + s_max("newData.child('subject')", 20) + ")",
                "(!newData.child('kind').exists() || newData.child('kind').val() == 'q' || newData.child('kind').val() == 'chat' || newData.child('kind').val() == 'tip')",
                "(!newData.child('authorGov').exists() || " + s_max("newData.child('authorGov')", 30) + ")",
                "(!newData.child('best').exists() || newData.child('best').isNumber())") + ")",
            "answersCount": {".write": SIGNED, ".validate": counter()},
            "likes": {"$uid": {".write": OWNER}},
        },
    },
    "forumAnswers": {
        ".read": True,
        "$t": {"$id": {
            ".write": ors(ADMIN, "auth != null && (data.exists() ? data.child('authorUid').val() == auth.uid : newData.child('authorUid').val() == auth.uid)"),
            ".validate": "!newData.exists() || (" + ands(s_max("newData.child('body')", 2000), "(!newData.child('authorGov').exists() || " + s_max("newData.child('authorGov')", 30) + ")") + ")",
            # a "helpful" vote on someone's answer: each student writes only their own mark
            "likes": {"$uid": {".write": OWNER}},
        }},
    },

    # ----- forest, governorate war, golden hour, dreams, polls -----
    "forest": {
        ".read": True,
        "govs": {"$g": {".write": SIGNED, ".validate": ors(ADMIN, ands(
            "newData.child('t').isNumber()", "newData.child('t').val() == (data.child('t').exists() ? data.child('t').val() : 0) + 1",
            "newData.child('m').isNumber()", "newData.child('m').val() >= (data.child('m').exists() ? data.child('m').val() : 0)",
            "newData.child('m').val() <= (data.child('m').exists() ? data.child('m').val() : 0) + 90"))}},
        "gold": {"$g": {"$i": {".write": SIGNED, ".validate": ors(ADMIN, "newData.val() === true")}}},
        "last": {".write": SIGNED, ".validate": ors(ADMIN, "newData.hasChildren(['g', 'm', 'at']) && newData.child('m').isNumber() && newData.child('m').val() <= 90 && newData.child('u').val() == auth.uid")},
    },
    "govWar": {
        ".read": True,
        "$wk": {"$g": {".write": SIGNED, ".validate": ors(ADMIN, ands(
            "newData.child('sessions').val() == (data.child('sessions').exists() ? data.child('sessions').val() : 0) + 1",
            "newData.child('minutes').isNumber()", "newData.child('minutes').val() >= (data.child('minutes').exists() ? data.child('minutes').val() : 0)",
            "newData.child('minutes').val() <= (data.child('minutes').exists() ? data.child('minutes').val() : 0) + 90"))}},
    },
    "golden": {".read": True, "$day": {"n": {".write": SIGNED, ".validate": counter()}}},
    "dreams": {
        ".read": True,
        "$id": {
            ".write": ors(ADMIN, "auth != null && (data.exists() ? data.child('o').val() == auth.uid && !newData.exists() : newData.child('o').val() == auth.uid)"),
            ".validate": "!newData.exists() || (newData.child('t').isString() && newData.child('t').val().length <= 120)",
            "amen": {".write": True, ".validate": counter()},
        },
    },
    "polls": {".read": True, ".write": ADMIN, "$pid": {"counts": {"$i": {".write": True, ".validate": counter()}}}},
    "pollVotes": {"$pid": {"$voter": {".read": True, ".write": "!data.exists() && ($voter.beginsWith('d_') || (auth != null && auth.uid == $voter))", ".validate": "newData.isNumber()"}}},

    # ----- the students' map: each student's governorate and today's mood, and reactions that
    # float up from a governorate for a moment. A reaction comes from the sender's own
    # governorate, at most one every 2.5 seconds (studentMap/{uid}/r moves on in the same write),
    # and anyone may clear reactions older than a minute.
    "studentMap": {
        ".read": SIGNED,
        "$uid": {
            ".write": ors(OWNER, ADMIN),
            ".validate": "newData.hasChildren(['g', 't'])",
            "g": {".validate": "newData.isString() && newData.val().matches(" + GOV_RE + ")"},
            "t": {".validate": "newData.isNumber() && newData.val() <= now + 60000"},
            "m": {".validate": "newData.isString() && newData.val().matches(/^(happy|ok|tired|stress)$/)"},
            "d": {".validate": "newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)"},
            "r": {".validate": "newData.val() === now && (!data.exists() || now - data.val() >= 2500)"},
            "$other": {".validate": False},
        },
    },
    "mapReacts": {
        ".read": SIGNED,
        ".indexOn": ["t"],
        "$k": {
            ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.child('u').val() == auth.uid"),
                          ands(SIGNED, "!newData.exists()", "data.child('t').val() < now - 60000")),
            ".validate": "!newData.exists() || (" + ands(
                "newData.hasChildren(['u', 'g', 'e', 't'])",
                "newData.child('t').val() === now",
                "newData.child('e').isString() && newData.child('e').val().matches(/^(heart|laugh|fire|party|sad|angry|tired|support)$/)",
                "newData.child('g').val() === newData.parent().parent().child('studentMap/' + auth.uid + '/g').val()",
                "newData.parent().parent().child('studentMap/' + auth.uid + '/r').val() === now") + ")",
            "$other": {".validate": "$other == 'u' || $other == 'g' || $other == 'e' || $other == 't'"},
        },
    },

    # ----- study places: students suggest (spotsPending), the admin approves into spots; ratings,
    # and who is studying at a place now (each student writes only their own row) -----
    "spots": {".read": True, ".write": ADMIN, ".indexOn": ["g"], "$id": SPOT},
    "spotImgs": {".read": True, ".write": ADMIN, "$id": {".validate": s_max("newData", 400000)}},
    "spotsPending": {
        ".read": ADMIN,
        "$id": {
            ".read": ors(ADMIN, "auth != null && data.child('by').val() == auth.uid"),
            ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.child('by').val() == auth.uid")),
            ".validate": "!newData.exists() || " + SPOT_OK,
            **SPOT_FIELDS,
        },
    },
    "spotsPendingImgs": {"$id": {
        ".read": ADMIN,
        ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.parent().parent().child('spotsPending/' + $id + '/by').val() == auth.uid")),
        ".validate": "!newData.exists() || (" + s_max("newData", 400000) + ")",
    }},
    "spotRates": {".read": True, "$sid": {"$uid": {
        ".write": ors(OWNER, ADMIN),
        ".validate": "!newData.exists() || (" + ands("root.child('spots/' + $sid).exists()", "newData.child('s').isNumber()",
                                                      "newData.child('s').val() >= 1", "newData.child('s').val() <= 5",
                                                      "newData.child('at').val() == now", s_max("newData.child('n')", 40)) + ")",
        "c": {".validate": s_max("newData", 200)},
    }}},
    "spotHere": {".read": True, "$sid": {"$uid": {
        ".write": ors(OWNER, ADMIN),
        ".validate": "!newData.exists() || (" + ands("root.child('spots/' + $sid).exists()", "newData.child('t').val() == now", s_max("newData.child('n')", 40)) + ")",
    }}},

    # ----- فضفضة: anonymous venting. Posts and replies carry no name or governorate; who wrote
    # them is kept apart (ventOwners, ventReplyOwners), readable by the admin only. One post
    # every 5 minutes and one reply every 15 seconds; the worst words are refused here too.
    "vent": {".read": SIGNED, ".indexOn": ["at"], "$id": {
        ".write": ors(ADMIN,
                      ands(SIGNED, "!data.exists()", VENT_OK_USER,
                           "newData.parent().parent().child('ventOwners/' + $id).val() == auth.uid",
                           "newData.parent().parent().child('ventLast/' + auth.uid).val() == now"),
                      ands(SIGNED, "!newData.exists()", "root.child('ventOwners/' + $id).val() == auth.uid")),
        ".validate": "!newData.exists() || (" + ands("newData.hasChildren(['tx', 'm', 'at'])", "newData.child('at').val() == now") + ")",
        "tx": {".validate": "newData.isString() && newData.val().length >= 3 && newData.val().length <= 400 && !newData.val().matches(" + VENT_BAD + ")"},
        "m": {".validate": "newData.isString() && newData.val().matches(/^(sad|worry|tired|upset|hope|lost)$/)"},
        "at": {".validate": "newData.isNumber()"},
        "$other": {".validate": False},
    }},
    "ventOwners": {"$id": {".read": ADMIN, ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.val() == auth.uid"),
                                                          ands(SIGNED, "!newData.exists()", "data.val() == auth.uid"))}},
    "ventLast": {"$uid": {".read": ors(OWNER, ADMIN), ".write": OWNER, ".validate": "newData.val() == now && (!data.exists() || now - data.val() >= 300000)"}},
    "ventReplies": {".read": SIGNED, "$pid": {".write": ADMIN, "$rid": {
        ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", VENT_OK_USER, "root.child('vent/' + $pid).exists()",
                                  "newData.parent().parent().parent().child('ventReplyOwners/' + $pid + '/' + $rid).val() == auth.uid",
                                  "newData.parent().parent().parent().child('ventLastR/' + auth.uid).val() == now")),
        ".validate": "!newData.exists() || (" + ands("newData.child('at').val() == now",
                                                      ors("newData.child('k').isString() && newData.child('k').val().matches(/^[smd][1-9]$/)",
                                                          "newData.child('tx').isString() && newData.child('tx').val().length >= 2 && newData.child('tx').val().length <= 200 && !newData.child('tx').val().matches(" + VENT_BAD + ")")) + ")",
        "$other": {".validate": "$other == 'k' || $other == 'tx' || $other == 'at'"},
    }}},
    "ventReplyOwners": {"$pid": {".write": ADMIN, "$rid": {".read": ADMIN, ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.val() == auth.uid"))}}},
    "ventLastR": {"$uid": {".read": ors(OWNER, ADMIN), ".write": OWNER, ".validate": "newData.val() == now && (!data.exists() || now - data.val() >= 15000)"}},
    # one reaction and one report per student per post; the counters move by one with them
    "ventReactOwners": {"$pid": {".write": ADMIN, "$uid": {".read": ors(OWNER, ADMIN), ".write": ors(ADMIN, ands(OWNER, "!data.exists()")),
                                          ".validate": "newData.isString() && newData.val().matches(/^(hug|power|pray)$/)"}}},
    "ventReports": {".read": ADMIN, "$pid": {".write": ADMIN, "$uid": {".read": ors(OWNER, ADMIN), ".write": ors(ADMIN, ands(OWNER, "!data.exists()")), ".validate": "newData.val() === true"}}},
    "ventCount": {".read": SIGNED, "$pid": {".write": ADMIN, "$k": {
        ".write": SIGNED,
        ".validate": ors(ADMIN, ands("newData.isNumber()", "newData.val() == (data.exists() ? data.val() : 0) + 1", ors(
            ands("$k.matches(/^(hug|power|pray)$/)", "!root.child('ventReactOwners/' + $pid + '/' + auth.uid).exists()",
                 "newData.parent().parent().parent().child('ventReactOwners/' + $pid + '/' + auth.uid).val() == $k"),
            ands("$k == 'rep'", "!root.child('ventReports/' + $pid + '/' + auth.uid).exists()",
                 "newData.parent().parent().parent().child('ventReports/' + $pid + '/' + auth.uid).val() === true"),
            ands("$k == 'rc'", "newData.parent().parent().parent().child('ventLastR/' + auth.uid).val() == now")))),
    }}},
    # what the filter stopped (or a post that sounds like the student may hurt themselves)
    "ventAlerts": {".read": ADMIN, "$id": {
        ".write": ors(ADMIN, ands(SIGNED, "!data.exists()", "newData.child('u').val() == auth.uid")),
        ".validate": "!newData.exists() || (" + ands("newData.child('at').val() == now", s_max("newData.child('tx')", 500),
                                                      "newData.child('kind').isString() && newData.child('kind').val().matches(/^(bad|sex|danger)$/)") + ")",
    }},
    "ventBan": {"$uid": {".read": ors(OWNER, ADMIN), ".write": ADMIN}},

    # ----- صندوق الأفكار: students suggest features and vote; the admin sets the status and
    # answers. One idea every 10 minutes; one vote per student, the count moves with it. -----
    "ideas": {".read": SIGNED, ".indexOn": ["v", "at"], "$id": {
        ".write": ors(ADMIN,
                      ands(SIGNED, "!data.exists()", "newData.child('by').val() == auth.uid",
                           "newData.parent().parent().child('ideaLast/' + auth.uid).val() == now"),
                      ands(SIGNED, "!newData.exists()", "data.child('by').val() == auth.uid", "data.child('st').val() == 'new'")),
        ".validate": "!newData.exists() || data.exists() || (" + ands(
            "newData.hasChildren(['t', 'c', 'by', 'n', 'st', 'v', 'at'])", "newData.child('st').val() == 'new'",
            "newData.child('v').val() == 0", "newData.child('at').val() == now") + ")",
        "t": {".validate": "newData.isString() && newData.val().length >= 5 && newData.val().length <= 80 && !newData.val().matches(" + VENT_BAD + ")"},
        "d": {".validate": "newData.isString() && newData.val().length <= 400 && !newData.val().matches(" + VENT_BAD + ")"},
        "c": {".validate": "newData.isString() && newData.val().matches(/^(study|play|look|store|other)$/)"},
        "n": {".validate": "newData.isString() && newData.val().length <= 30"},
        "by": {".validate": "newData.isString()"},
        "st": {".validate": "newData.isString() && newData.val().matches(/^(new|review|doing|done|no)$/)"},
        "r": {".validate": "newData.isString() && newData.val().length <= 300"},
        "paid": {".validate": "newData.isBoolean()"},
        "at": {".validate": "newData.isNumber()"},
        "v": {
            ".write": SIGNED,
            ".validate": ors(ADMIN, ands("newData.isNumber()", ors(
                ands("!root.child('ideas/' + $id).exists()", "newData.val() == 0"),
                ands("newData.val() == (data.exists() ? data.val() : 0) + 1",
                     "!root.child('ideaVotes/' + $id + '/' + auth.uid).exists()",
                     "newData.parent().parent().parent().child('ideaVotes/' + $id + '/' + auth.uid).val() === true"),
                ands("data.exists()", "newData.val() == data.val() - 1",
                     "root.child('ideaVotes/' + $id + '/' + auth.uid).exists()",
                     "!newData.parent().parent().parent().child('ideaVotes/' + $id + '/' + auth.uid).exists()")))),
        },
        "$other": {".validate": False},
    }},
    "ideaVotes": {"$id": {".write": ADMIN, "$uid": {".read": ors(OWNER, ADMIN), ".write": OWNER,
                                                    ".validate": "newData.val() === true && root.child('ideas/' + $id).exists()"}}},
    "ideaMine": {"$uid": {".read": OWNER, ".write": ors(OWNER, ADMIN)}},
    "ideaLast": {"$uid": {".read": ors(OWNER, ADMIN), ".write": OWNER, ".validate": "newData.val() == now && (!data.exists() || now - data.val() >= 600000)"}},

    # ----- usage numbers and error reports (also before signing in) -----
    # anyone (signed in or not) pings with these fields only, each small
    "devices": {"$id": {
        ".write": True,
        ".validate": "$id.length <= 64 && newData.hasChildren(['last']) && newData.child('last').isNumber()",
        "gov": {".validate": s_max("newData", 30)}, "push": {".validate": s_max("newData", 12)}, "app": {".validate": s_max("newData", 10)},
        "installed": {".validate": "newData.isBoolean()"}, "member": {".validate": "newData.isNumber()"}, "last": {".validate": "newData.isNumber()"},
        "$other": {".validate": False},
    }},
    "stats": {"daily": {"$d": {"opens": {".read": True, ".write": True, ".validate": counter()}}}},
    "newsViews": {"$k": {".read": True, ".write": True, ".validate": counter()}},
    "errors": {"$k": {
        ".read": True, ".write": "newData.exists()",
        ".validate": "$k.length <= 40 && newData.child('msg').isString() && newData.child('msg').val().length <= 600 && newData.child('n').isNumber()",
        "msg": {".validate": s_max("newData", 600)}, "n": {".validate": "newData.isNumber()"},
        "src": {".validate": s_max("newData", 400)}, "stack": {".validate": s_max("newData", 1500)}, "view": {".validate": s_max("newData", 40)},
        "dev": {".validate": s_max("newData", 80)}, "ver": {".validate": s_max("newData", 20)},
        "line": {".validate": "newData.isNumber()"}, "col": {".validate": "newData.isNumber()"}, "first": {".validate": "newData.isNumber()"}, "last": {".validate": "newData.isNumber()"},
        "$other": {".validate": False},
    }},
}

with open(os.path.join(ROOT, 'database.rules.json'), 'w', encoding='utf-8') as f:
    json.dump({"rules": rules}, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('database.rules.json written')
