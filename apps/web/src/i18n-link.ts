// D532: the page's link to its home, the Mac's words for it (apps/desktop/internal/i18n/link.go,
// D520): a loss said quietly first, plainly after a while, and the connect screen only when the
// home itself said this device is disconnected. Glossary: design/product-model.md "the link to the
// home". "This Mac" is "this phone" here (the pairing screen's own word), "this computer" on the
// home's own page.
export const linkWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "conn.reconnecting": "正在重新连上 %s…",
    "conn.offline": "连不上 %s，正在重试",
    "conn.lost.title": "连不上 %s 上的 Ducter",
    "conn.lost.body": "%s 开着吗？网络通吗？这里会一直自己重试，一连上就接着来，什么都不会丢。",
    "conn.lost.title.local": "这台电脑上的 Ducter 没有回应",
    "conn.lost.body.local": "这里会一直自己重试，一连上就接着来，什么都不会丢。",
    "conn.lost.again": "再连一次",
    "conn.retry": "立即连接",
    "conn.retry.in": "%d 秒后重新连接",
    "conn.retrying": "正在连接…",
    "connect.revoked": "%s 上的 Ducter 已经断开了这台手机。要回来，就再连一次。",
    "connect.unknown": "%s 上的 Ducter 认不出这台手机了，可能是它的设备记录被重置过。要回来，就再连一次。",
    "connect.back": "返回",
    // D543: what was sent while the link was down waits on this phone and goes when it is back.
    "conn.queued": "连上就发出去",
    "conn.ask.again": "还没连上 %s。这一步不能晚点再发，连上后再点一次。",
    "conn.answer.stale": "断开得太久，刚才的回答没有替你发出去。再看一眼那张卡片。",
  },
  en: {
    "conn.reconnecting": "Reconnecting to %s…",
    "conn.offline": "Can't reach %s, retrying",
    "conn.lost.title": "Can't reach your Ducter on %s",
    "conn.lost.body": "Is %s on, and is the network up? This keeps trying by itself and carries on the moment it's back. Nothing is lost.",
    "conn.lost.title.local": "Ducter on this computer isn't answering",
    "conn.lost.body.local": "This keeps trying by itself and carries on the moment it's back. Nothing is lost.",
    "conn.lost.again": "Connect it again",
    "conn.retry": "Try now",
    "conn.retry.in": "Trying again in %d s",
    "conn.retrying": "Connecting…",
    "connect.revoked": "Your Ducter on %s disconnected this phone. Connect it again to come back.",
    "connect.unknown": "Your Ducter on %s doesn't know this phone anymore; its list of devices may have been reset. Connect it again to come back.",
    "connect.back": "Back",
    "conn.queued": "Sends when it's back",
    "conn.ask.again": "Not connected to %s yet. This one can't be sent later: tap it again once it's back.",
    "conn.answer.stale": "The link was down too long, so your answer wasn't sent. Have another look at the card.",
  },
};
