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
                                  "forestConfig", "govWarConfig", "auctionHistory", "admission"]},
    "bannedStudents": signed_admin,

    # ----- students -----
    "users": {
        ".read": SIGNED,
        "$uid": {
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
    # the challenger also lists the duel for the other player
    "userDuels": {"$uid": {".read": OWNER, ".write": ors(OWNER, ADMIN), "$id": {".write": "auth != null && root.child('duels/' + $id + '/player1Uid').val() == auth.uid"}}},
    "presence": {".read": SIGNED, "$uid": {".write": ors(OWNER, ADMIN)}},
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
            "$other": {".write": ors(OWNER, ADMIN,
                                    "auth != null && auth.uid == $other && !newData.exists()",
                                    "auth != null && auth.uid == $other && root.child('friendRequests/' + auth.uid + '/' + $uid).exists()")},
        },
    },
    "userChats": {
        "$uid": {".read": OWNER, "$other": {".write": ors(OWNER, ADMIN, "auth != null && auth.uid == $other")}},
    },
    "privateChats": {
        "$chat": {
            ".read": "auth != null && ($chat.beginsWith(auth.uid + '_') || $chat.endsWith('_' + auth.uid))",
            ".write": ors(ADMIN, "auth != null && ($chat.beginsWith(auth.uid + '_') || $chat.endsWith('_' + auth.uid))"),
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
    "voiceRoom": {
        "participants": {".read": SIGNED, "$uid": {".write": ors(OWNER, ADMIN)}},
        "calls": {"$uid": {".read": OWNER, ".write": ors(OWNER, ADMIN), "$other": {".read": "auth != null && auth.uid == $other", ".write": "auth != null && auth.uid == $other"}}},
    },

    # ----- forum -----
    "forumThreads": {
        ".read": True,
        "$id": {
            ".write": ors(ADMIN, "auth != null && (data.exists() ? data.child('authorUid').val() == auth.uid : newData.child('authorUid').val() == auth.uid)"),
            "answersCount": {".write": SIGNED, ".validate": counter()},
            "likes": {"$uid": {".write": OWNER}},
        },
    },
    "forumAnswers": {
        ".read": True,
        "$t": {"$id": {".write": ors(ADMIN, "auth != null && (data.exists() ? data.child('authorUid').val() == auth.uid : newData.child('authorUid').val() == auth.uid)")}},
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

    # ----- usage numbers and error reports (also before signing in) -----
    "devices": {"$id": {".write": True, ".validate": "newData.hasChildren(['last']) && newData.child('last').isNumber()"}},
    "stats": {"daily": {"$d": {"opens": {".read": True, ".write": True, ".validate": counter()}}}},
    "newsViews": {"$k": {".read": True, ".write": True, ".validate": counter()}},
    "errors": {"$k": {".read": True, ".write": "newData.exists()", ".validate": "newData.child('msg').isString() && newData.child('msg').val().length <= 600 && newData.child('n').isNumber()"}},
}

with open(os.path.join(ROOT, 'database.rules.json'), 'w', encoding='utf-8') as f:
    json.dump({"rules": rules}, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('database.rules.json written')
