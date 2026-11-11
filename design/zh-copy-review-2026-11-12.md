# Chinese Copy Review (2026-11-12)

> Asked by the author: 「我之前注意到那个'不做了'的表达非常不 Native speaker 哈，类似的表达请你仔细审视杜绝一下…」. Decided as
> D214 (its rules are there). Every zh string on web, Mac, the CLI, iOS, Android and core's fixed lines was read; this is
> every change, by key. Keys shared by the web and the Mac keep one value; a key whose value differs by surface (这台手机 /
> 这台 Mac) has a row per value. Surfaces: web = `apps/web/src/i18n*.ts`, mac = `apps/desktop/internal/i18n/*.go`, cli =
> `packages/cli/src/i18n.ts`.

411 rows.

| Key | Old | New | Where |
|---|---|---|---|
| `ability.add` | 装到 %s 上 | 安装到 %s | mac i18n.go |
| `ability.remove` | 取下 | 移除 | mac i18n.go |
| `ability.remove.keep` | 先留着 | 取消 | mac i18n.go |
| `ability.remove.web` | 取下以后，要上网的事就不会在 %s 上开始，我会先跟你说一声。随时可以再装上。 | 移除以后，要上网的事就不会在 %s 上开始，我会先跟你说一声。随时可以再装上。 | mac i18n.go |
| `ability.removed` | {device} 先不上网了。随时可以再装上：ducter ability add browser | {device} 不再上网了。随时可以再装上：ducter ability add browser | cli i18n.ts |
| `ability.removed.web` | %s 先不上网了 | %s 不再上网了 | mac i18n.go |
| `acct.add` | 加一个 | 添加 | web i18n.ts, mac ia.go |
| `acct.check` | 检查并加上 | 检查并添加 | web i18n.ts, mac ia.go |
| `acct.err.blocked` | 对方的防火墙拦下了 Ducter，不是钥匙的问题。过一会儿再试。 | 对方的防火墙拦下了 Ducter，不是密钥的问题。过一会儿再试。 | mac phone.go |
| `acct.err.blocked` | 对方的防火墙挡住了 Ducter，不是钥匙的问题。过一会儿再试。 | 对方的防火墙挡住了 Ducter，不是密钥的问题。过一会儿再试。 | web i18n-phone.ts |
| `acct.err.no_key` | 先把钥匙填上。 | 先填上密钥。 | web i18n.ts, mac ia.go |
| `acct.err.unauthorized` | 钥匙不对或已失效，换一把新的。 | 密钥不对或已失效，换一个新的。 | web i18n.ts, mac ia.go |
| `acct.how.mcp` | 1. 地址填这个 MCP 服务的地址。 2. 它要钥匙的话，把它给的那串填在“钥匙”里。 3. 点“检查并加上”。 | 1. 地址填这个 MCP 服务的地址。 2. 它要密钥的话，把它给的那串填在“密钥”里。 3. 点“检查并添加”。 | web i18n.ts, mac ia.go |
| `acct.how.self` | 1. 地址填你自己部署的 OpenConnector（比如 http://localhost:3000）。 2. 在它的 Access 页点 Create Token，给 Ducter 单建一把钥匙。 3. 把钥匙填在上面，点“检查并加上”。 | 1. 地址填你自己部署的 OpenConnector（比如 http://localhost:3000）。 2. 在它的 Access 页点 Create Token，给 Ducter 单独建一个密钥。 3. 把密钥填在上面，点“检查并添加”。 | web i18n.ts, mac ia.go |
| `acct.key` | 钥匙 | 密钥 | web i18n.ts, mac ia.go |
| `acct.key.get` | 去拿钥匙 | 获取密钥 | web i18n.ts, mac ia.go |
| `acct.key.hide` | 藏起来 | 隐藏 | web i18n.ts, mac ia.go |
| `acct.manual` | 用地址和钥匙加一个 | 用地址和密钥添加 | web i18n.ts, mac ia.go |
| `acct.oo.lede` | 不用配钥匙：Ducter 通过 oo 去看，登录留在 oo 里。 | 不用配密钥：Ducter 通过 oo 去看，登录留在 oo 里。 | web i18n.ts, mac ia.go |
| `acct.oo.using` | 正在加上… | 正在添加… | web i18n.ts, mac ia.go |
| `acct.remove.keep` | 算了 | 取消 | web i18n.ts, mac ia.go |
| `acct.state.unauthorized` | 钥匙不对，换一把 | 密钥不对，换一个 | web i18n.ts, mac ia.go |
| `acct.step.oomol.2` | 在 OOMOL 控制台新建一把钥匙。 | 在 OOMOL 控制台新建一个密钥。 | web i18n.ts, mac ia.go |
| `acct.step.oomol.3` | 把钥匙粘贴到下面，再点“检查并加上”。 | 把密钥粘贴到下面，再点“检查并添加”。 | web i18n.ts, mac ia.go |
| `acct.where.mcp.note` | 别的能连账号的服务也行。它没标“只读”的事，一律先等你说好。 | 别的能连账号的服务也行。没标“只读”的操作，都会先问你。 | web i18n.ts, mac ia.go |
| `activity.long` | 还在弄。你可以先忙别的，好了我说 | 还在处理。你可以先忙别的，好了告诉你 | web i18n.ts, mac i18n.go |
| `activity.messaging_task` | 在把你的话带过去… | 在转告它… | web i18n.ts, mac i18n.go |
| `activity.slow` | 比平常久一点，还在弄 | 比平时久一点，还在处理 | web i18n.ts, mac i18n.go |
| `af.card.add` | 存一张卡 | 添加卡片 | web i18n-autofill.ts, mac autofill.go |
| `af.card.name` | 卡上的名字 | 持卡人姓名 | web i18n-autofill.ts, mac autofill.go |
| `af.d.add` | 填一下你的资料 | 填写你的资料 | web i18n-autofill.ts, mac autofill.go |
| `af.d.clear` | 清掉这一项 | 清除这一项 | web i18n-autofill.ts, mac autofill.go |
| `af.d.edit` | 改 | 编辑 | web i18n-autofill.ts, mac autofill.go |
| `af.d.kept` | 存了 %d 项 | 已存 %d 项 | web i18n-autofill.ts, mac autofill.go |
| `af.d.name` | 名字（和证件一致） | 姓名（与证件一致） | web i18n-autofill.ts, mac autofill.go |
| `af.err.failed` | 没存上 | 没能保存 | web i18n-autofill.ts, mac autofill.go |
| `af.err.invalid` | 这个不太对 | 格式不对 | web i18n-autofill.ts, mac autofill.go |
| `af.err.not_found` | 这个已经不在了 | 这一项已经不在了 | web i18n-autofill.ts, mac autofill.go |
| `af.kept.file` | 锁着存在 %s 上，钥匙是一个只有 Ducter 能读的文件。不会同步到手机或别的电脑。 | 锁着存在 %s 上，密钥在一个只有 Ducter 能读的文件里。不会同步到手机或别的电脑。 | web i18n-autofill.ts, mac autofill.go |
| `af.kept.keychain` | 锁着存在 %s 上，钥匙在这台 Mac 的钥匙串里。不会同步到手机或别的电脑。 | 锁着存在 %s 上，密钥在这台 Mac 的钥匙串里。不会同步到手机或别的电脑。 | web i18n-autofill.ts, mac autofill.go |
| `af.remove` | 删掉 | 删除 | web i18n-autofill.ts, mac autofill.go |
| `af.remove.go` | 确定删掉 | 删除 | web i18n-autofill.ts, mac autofill.go |
| `af.save` | 存好 | 保存 | web i18n-autofill.ts, mac autofill.go |
| `af.signin.add` | 存一个登录 | 添加登录信息 | web i18n-autofill.ts, mac autofill.go |
| `af.use.declined` | 你没让用 %s | 你没同意用 %s | web i18n-autofill.ts, mac autofill.go |
| `af.uses` | 用在了哪儿 | 使用记录 | web i18n-autofill.ts, mac autofill.go |
| `agents.phase.failed` | 没更新成 | 没能更新 | cli i18n.ts |
| `agents.phase.waiting` | 等它手上的事停好… | 等它手上的事停下… | cli i18n.ts |
| `agentv.phase.done` | 好了，现在是 %s | 已更新到 %s | web i18n.ts, mac agents.go |
| `agentv.phase.failed` | 没更新成 | 没能更新 | web i18n.ts, mac agents.go |
| `agentv.phase.rolledback` | 没更新成，已经换回 %s | 没能更新，已经换回 %s | web i18n.ts, mac agents.go |
| `agentv.phase.waiting` | 等它手上的事停好… | 等它手上的事停下… | web i18n.ts, mac agents.go |
| `agentv.why.signed_out` | 更新以后它的登录不灵了。 | 更新以后需要重新登录。 | web i18n.ts, mac agents.go |
| `bg.note` | 接下来 macOS 会弹一条关于后台项目的通知：那就是 Ducter 在后台干活，不用管它。它在「系统设置 › 通用 › 登录项与扩展」里。 | 接下来 macOS 会弹一条关于后台项目的通知：那就是 Ducter 在后台运行，不用管它。它在「系统设置 › 通用 › 登录项与扩展」里。 | mac onboard.go |
| `bridge.connect` | 连上 | 连接 | web i18n.ts, mac i18n.go |
| `bridge.connecting` | 在连… | 正在连接… | web i18n.ts, mac i18n.go |
| `bridge.refused.attachment_mismatch` | Nowledge Mem 里「%s」收消息的地方和它对不上了。请在 Mem 里请工作区的管理员查一下，再回来点「再试一次」。 | Nowledge Mem 里「%s」收消息的地方和它对不上了。请让 Mem 工作区的管理员查一下，再回来点「再试一次」。 | web i18n.ts, mac i18n.go |
| `bridge.refused.authority_missing` | Nowledge Mem 说你这个登录现在还不能代表「%s」。请在 Mem 里请工作区的管理员查一下它最初是怎么登记的；不用新建身份或钥匙。 | Nowledge Mem 说你这个登录现在还不能代表「%s」。请让 Mem 工作区的管理员查一下它最初是怎么登记的；不用新建身份或密钥。 | web i18n.ts, mac i18n.go |
| `bridge.refused.custody_birth_missing` | Nowledge Mem 里「%s」缺了它最初的登记。请在 Mem 里请工作区的管理员查一下它的登记；别重新登记，也别新建钥匙。 | Nowledge Mem 里「%s」缺了它最初的登记。请让 Mem 工作区的管理员查一下它的登记；别重新登记，也别新建密钥。 | web i18n.ts, mac i18n.go |
| `bridge.refused.lifetime_inactive` | Nowledge Mem 里「%s」已经停用了，再连也连不回来。请在 Mem 里请工作区的管理员查一下它为什么停了。 | Nowledge Mem 里「%s」已经停用了，再连也连不回来。请让 Mem 工作区的管理员查一下它为什么停了。 | web i18n.ts, mac i18n.go |
| `bridge.undo.keep` | 先不 | 取消 | web i18n.ts, mac i18n.go |
| `call.cancel` | 不打了 | 取消通话 | web i18n-phone.ts, mac phone.go |
| `call.card.stop` | 不用 %s 打电话了 | 断开 %s | web i18n-phone.ts |
| `call.fail.too_long` | 超过 17 分钟，挂了 | 超过 17 分钟，已挂断 | web i18n-phone.ts |
| `call.go` | 打过去 | 拨打 | mac phone.go |
| `call.hold` | 先不打 | 暂不拨打 | web i18n-phone.ts, mac phone.go |
| `call.keep` | 不说 | 不透露 | mac phone.go |
| `call.now` | 现在就打 | 立即拨打 | web i18n-phone.ts, mac phone.go |
| `call.offer.go` | 连上 Tuwa | 连接 Tuwa | web i18n-phone.ts |
| `call.row.automated` | 转到了自动语音 · %s | 接通的是自动语音 · %s | mac phone.go |
| `call.row.cancelled` | 挂了 · %s | 已挂断 · %s | mac phone.go |
| `call.row.keep` | 不说 | 不透露 | web i18n-phone.ts |
| `call.row.needs_go` | 等你点头：打给 %s | 等你确认：打给 %s | mac phone.go |
| `call.signin.cancel` | 先不连 | 取消 | web i18n-phone.ts |
| `call.signin.code` | 要核对的码 | 核对码 | web i18n-phone.ts |
| `call.signin.retry` | 再来一次 | 再试一次 | web i18n-phone.ts |
| `call.st.automated` | 转到了自动语音 · %s | 接通的是自动语音 · %s | web i18n-phone.ts |
| `call.st.cancelled` | 挂了 · %s | 已挂断 · %s | web i18n-phone.ts |
| `call.st.needs_go` | 等你点头：打给 %s | 等你确认：打给 %s | web i18n-phone.ts |
| `call.then` | 到点再打 | 到时拨打 | mac phone.go |
| `call.went.then` | 好，到点就打。 | 好，到时就打。 | web i18n-phone.ts |
| `call.when.now` | 你点了就打 | 你确认后立即拨打 | web i18n-phone.ts, mac phone.go |
| `call.when.soon` | 待会儿 | 稍后 | web i18n-phone.ts |
| `call.why.too_long` | 超过 17 分钟，挂了 | 超过 17 分钟，已挂断 | mac phone.go |
| `cand.not_installed` | 还没装 | 未安装 | web i18n.ts, mac loadout.go |
| `cand.signed_out` | 没登录 | 未登录 | web i18n.ts, mac loadout.go |
| `card.key_bad` | 钥匙失效了 · 换一把 | 密钥失效了 · 换一个 | web i18n.ts, mac accounts.go |
| `card.rename.hint` | 点一下改名字 | 点一下重命名 | web i18n.ts, mac devicecard.go |
| `card.stop` | 不用%s了 | 停用 %s | web i18n.ts, mac accounts.go |
| `card.stop.ask` | 不用了以后它就看不到这些账号；记下的事还在「记得什么」里，可以忘掉。 | 停用以后，它就看不到这些账号了；记下的事还在「记得什么」里，可以忘掉。 | web i18n.ts, mac accounts.go |
| `card.stop.go` | 不用了 | 停用 | web i18n.ts, mac accounts.go |
| `card.stop.keep` | 算了 | 取消 | web i18n.ts, mac accounts.go |
| `check.harness.none` | Ducter 至少需要一个能干活的 AI：Claude Code、Codex、pi 或 DeepSeek Harness。 | Ducter 至少需要一个能做事的 AI：Claude Code、Codex、pi 或 DeepSeek Harness。 | cli i18n.ts |
| `chip.failed` | 没开成 | 没能打开 | web i18n.ts, mac devicecard.go |
| `chip.state.off` | 没开 | 关着 | web i18n.ts, mac devicecard.go |
| `chip.stop.now` | 现在停 | 立即停止 | web i18n.ts, mac devicecard.go |
| `cli.offer.no` | 不用了 | 暂不 | mac i18n.go |
| `coin.signed_out` | 没登录 | 未登录 | web i18n.ts, mac devicecard.go |
| `conn.connecting` | 正在连上… | 正在连接… | web i18n.ts, mac i18n.go |
| `connect.busy` | 正在连… | 正在连接… | web i18n.ts, mac i18n.go |
| `connect.go` | 连上 | 连接 | web i18n.ts, mac i18n.go |
| `connect.paired` | 连上了 | 已连接 | web i18n.ts |
| `delivery.queued` | 它忙完手上的就看 | 它忙完手上的事就会看到 | web i18n.ts, mac i18n.go |
| `device.disconnect.cancel` | 算了 | 取消 | web i18n.ts, mac devupdate.go |
| `device.rename` | 改名字 | 重命名 | web i18n.ts, mac i18n.go |
| `device.rename.cancel` | 不改了 | 取消 | mac i18n.go |
| `device.rename.failed` | 没改成。 | 没能重命名。 | web i18n.ts |
| `device.rename.keys` | 回车保存，Esc 不改 | 回车保存，Esc 取消 | web i18n.ts, mac devupdate.go |
| `device.rename.ok` | 就叫这个 | 保存 | mac i18n.go |
| `devices.connect` | 连上手机或另一台电脑 | 连接手机或另一台电脑 | mac ia.go |
| `devices.loading` | 正在看看你的设备… | 正在查看你的设备… | mac i18n.go |
| `devices.seenAt` | 上次见到 {when} | 最后在线 {when} | cli i18n.ts |
| `devup.checked` | %s查过 | %s检查过 | web i18n.ts, mac devupdate.go |
| `devup.checking` | 在查… | 正在检查… | web i18n.ts, mac devupdate.go |
| `devup.checknow` | 现在检查 | 检查更新 | web i18n.ts, mac devupdate.go |
| `devup.how.app.here` | %s 上的 Ducter 会下载、核对，等手头的事停好再重启。 | %s 上的 Ducter 会下载、核对，等手头的事停下再重启。 | web i18n.ts, mac devupdate.go |
| `devup.how.source` | 这份 Ducter 是从源码跑的，跟着代码一起更新。 | 这份 Ducter 是从源码运行的，跟着代码一起更新。 | web i18n.ts, mac devupdate.go |
| `devup.phase.done` | 回来了，现在是 %s | 已更新到 %s | web i18n.ts, mac devupdate.go |
| `devup.phase.failed` | 没更新成 | 没能更新 | web i18n.ts, mac devupdate.go |
| `devup.phase.rolledback` | 没更新成，已经换回 %s | 没能更新，已经换回 %s | web i18n.ts, mac devupdate.go |
| `devup.phase.waiting` | 等手头的事停好… | 等手头的事停下… | web i18n.ts, mac devupdate.go |
| `devup.restart` | 重启它 | 重启 | mac devupdate.go |
| `devup.why.source` | 它是从源码跑的。 | 它是从源码运行的。 | web i18n.ts, mac devupdate.go |
| `fill.hold` | 先不用 | 暂不使用 | web i18n-autofill.ts, mac autofill.go |
| `fill.resolved.hold` | 没让用 | 你没同意 | web i18n-autofill.ts, mac autofill.go |
| `fill.title.detail` | 第一次把你的%[2]s给 %[1]s？ | 第一次向 %[1]s 填写你的%[2]s？ | web i18n-autofill.ts, mac autofill.go |
| `fill.title.signin` | 第一次用存着的登录进 %[1]s？ | 第一次用保存的登录信息登录 %[1]s？ | web i18n-autofill.ts, mac autofill.go |
| `find.passed` | 过了 | 已跳过 | web i18n.ts, mac accounts.go |
| `first.no` | 先不用 | 以后再说 | web i18n.ts, mac accounts.go |
| `firstrun.auto` | 不用管这个窗口，连上了它自己会切过去。 | 不用管这个窗口，连上以后会自动切换。 | mac i18n.go |
| `firstrun.body` | 在终端运行这一行，Ducter 就在这台 Mac 上开工： | 在终端运行这一行，Ducter 就会在这台 Mac 上启动： | mac i18n.go |
| `firstrun.copied` | 复制好了 | 已复制 | mac i18n.go |
| `firstrun.retry` | 现在就连 | 立即连接 | mac i18n.go |
| `firstrun.retry.in` | %d 秒后再连一次 | %d 秒后重新连接 | mac i18n.go |
| `firstrun.retrying` | 正在连… | 正在连接… | mac i18n.go |
| `fix.canceled` | 取消了。想装 %s 的时候再点一次。 | 已取消。想装 %s 的时候再点一次。 | mac onboard.go |
| `fix.canceled.short` | 取消了 | 已取消 | mac onboard.go |
| `fix.canceled.signin` | 取消了。想登录 %s 的时候再点一次。 | 已取消。想登录 %s 的时候再点一次。 | mac onboard.go |
| `fix.denied` | %s 没装成：有个文件夹写不进去。在终端里做，能看到是哪一个。 | %s 没能装好：有个文件夹写不进去。在终端里做，能看到是哪一个。 | mac onboard.go |
| `fix.failed` | %s 没装成。它最后说的是： | %s 没能装好。它最后说的是： | mac onboard.go |
| `fix.failed.short` | %s 没装成。再试一次，或者在终端里看看。 | %s 没能装好。再试一次，或者在终端里看看。 | mac onboard.go |
| `fix.grant` | 打开 %s 要的开关 | 打开 %s 需要的权限 | mac onboard.go |
| `fix.offline` | 连不上网，%s 没装成。连上网以后再试一次。 | 连不上网，%s 没能装好。连上网以后再试一次。 | mac onboard.go |
| `fix.signing.send` | 填好了 | 继续 | mac onboard.go |
| `fix.terminal` | 在终端里做 | 改用终端 | mac onboard.go |
| `folder.added` | 新加了 %d 个文件 | 新增 %d 个文件 | web i18n.ts, mac folder.go |
| `folder.added.one` | 新加了 1 个文件 | 新增 1 个文件 | web i18n.ts, mac folder.go |
| `folder.anytime` | 随时能改回去 | 随时都能还原 | web i18n.ts, mac folder.go |
| `folder.changed` | 改了 %d 个文件的内容 | 修改了 %d 个文件 | web i18n.ts, mac folder.go |
| `folder.changed.one` | 改了 1 个文件的内容 | 修改了 1 个文件 | web i18n.ts, mac folder.go |
| `folder.confirm.go` | 还是改回去 | 仍然还原 | web i18n.ts, mac folder.go |
| `folder.confirm.no` | 先不 | 取消 | web i18n.ts, mac folder.go |
| `folder.expired` | 过了 7 天，已经改不回去了 | 已经过了 7 天，不能再还原 | web i18n.ts, mac folder.go |
| `folder.keep` | 就这样 | 保留改动 | web i18n.ts, mac folder.go |
| `folder.kept` | 留下了这些改动 | 已保留这些改动 | web i18n.ts, mac folder.go |
| `folder.list` | 看看改了哪些 | 查看改动 | web i18n.ts, mac folder.go |
| `folder.more` | 还有 %d 条没列出来 | 另有 %d 项没列出 | web i18n.ts, mac folder.go |
| `folder.removed` | 删了 %d 个文件 | 删除了 %d 个文件 | web i18n.ts, mac folder.go |
| `folder.removed.one` | 删了 1 个文件 | 删除了 1 个文件 | web i18n.ts, mac folder.go |
| `folder.renamed` | 改了 %d 个文件名 | 重命名了 %d 个文件 | web i18n.ts, mac folder.go |
| `folder.renamed.one` | 改了 1 个文件名 | 重命名了 1 个文件 | web i18n.ts, mac folder.go |
| `folder.row.changed` | 改了 %s | 修改 %s | web i18n.ts, mac folder.go |
| `folder.row.dir` | 新文件夹 %s | 新建文件夹 %s | web i18n.ts, mac folder.go |
| `folder.row.removed` | 删了 %s | 删除 %s | web i18n.ts, mac folder.go |
| `folder.row.removedDir` | 删了文件夹 %s | 删除文件夹 %s | web i18n.ts, mac folder.go |
| `folder.row.restore` | 改回这个 | 还原这项 | web i18n.ts, mac folder.go |
| `folder.undo` | 改回去 | 全部还原 | web i18n.ts, mac folder.go |
| `folder.undone` | 改回去了，文件夹和它动手之前一模一样 | 已还原，文件夹回到了它动手之前的样子 | web i18n.ts, mac folder.go |
| `folder.until` | 随时能改回去，留到 %s | %s前都能还原 | web i18n.ts, mac folder.go |
| `folder.working` | 它做完后，可以全部改回去 | 它做完后，可以全部还原 | web i18n.ts, mac folder.go |
| `foot.keep` | 接着做 | 继续 | web i18n.ts, mac turns.go |
| `hello.back.afternoon` | 下午好呀，%s 在呢。 | 下午好，%s 在呢。 | web i18n.ts, mac i18n.go |
| `hello.back.evening` | 晚上好呀，%s 在呢。 | 晚上好，%s 在呢。 | web i18n.ts, mac i18n.go |
| `hello.back.late` | 这么晚还在忙呀，%s 陪着你。 | 这么晚还在忙，%s 陪着你。 | web i18n.ts, mac i18n.go |
| `hello.back.morning` | 早上好呀，%s 在呢。 | 早上好，%s 在呢。 | web i18n.ts, mac i18n.go |
| `hello.back.noon` | 中午好呀，%s 在呢。 | 中午好，%s 在呢。 | web i18n.ts, mac i18n.go |
| `hello.first.afternoon` | 下午好呀，我是 %s。 | 下午好，我是 %s。 | web i18n.ts, mac i18n.go |
| `hello.first.evening` | 晚上好呀，我是 %s。 | 晚上好，我是 %s。 | web i18n.ts, mac i18n.go |
| `hello.first.late` | 这么晚还没睡呀？我是 %s。 | 这么晚还没睡？我是 %s。 | web i18n.ts, mac i18n.go |
| `hello.first.morning` | 早上好呀，我是 %s。 | 早上好，我是 %s。 | web i18n.ts, mac i18n.go |
| `hello.first.noon` | 中午好呀，我是 %s。 | 中午好，我是 %s。 | web i18n.ts, mac i18n.go |
| `hello.news.open` | 去看看 | 查看 | web i18n.ts, mac i18n.go |
| `help.ability` | ability add browser：让这台电脑替任务上网（Ducter 自己装好浏览器）；ability remove browser 取下 | ability add browser：让这台电脑替任务上网（Ducter 自己装好浏览器）；ability remove browser 移除 | cli i18n.ts |
| `help.devices` | 列出已连接的设备；devices disconnect <编号> 断开一台，devices rename <编号> <名字> 改名字 | 列出已连接的设备；devices disconnect <编号> 断开一台，devices rename <编号> <名字> 重命名 | cli i18n.ts |
| `help.undo` | 把任务改过的文件夹改回去，和它动手之前一模一样（写标题里的几个字） | 把任务改过的文件夹还原，和它动手之前一模一样（写标题里的几个字） | cli i18n.ts |
| `isles.tag.moved` | 搬到 %s 上了 | 已转到 %s | mac isles.go |
| `live.close` | 关掉 | 关闭 | web i18n.ts, mac browser.go |
| `live.doing.tab` | 换到了另一个标签页 | 切换到了另一个标签页 | web i18n.ts, mac browser.go |
| `live.doing.type` | 正在往「%s」里填 | 正在填写「%s」 | web i18n.ts, mac browser.go |
| `live.done` | 好了 | 完成 | web i18n.ts, mac i18n.go |
| `live.failed` | 没打开：%s | 没能打开：%s | web i18n.ts, mac i18n.go |
| `live.myturn` | 换我来 | 接手 | web i18n.ts, mac browser.go |
| `live.notnow` | 先不登了 | 暂不登录 | web i18n.ts, mac i18n.go |
| `live.try.note` | 这是 %s 上的浏览器看到的网页，不是你的 Chrome。点点看、滚一滚都行。 | 这是 %s 上的浏览器看到的网页，不是你的 Chrome。可以点一点、滚动看看。 | web i18n.ts, mac i18n.go |
| `live.watch` | 看看 | 查看 | web i18n.ts, mac browser.go |
| `loadout.cancel` | 不换了 | 取消 | web i18n.ts, mac loadout.go |
| `loadout.missing` | 还没装 | 未安装 | web i18n.ts, mac loadout.go |
| `loadout.rule.remove` | 不要这条 | 删除 | web i18n.ts, mac loadout.go |
| `loadout.rule.removed` | 不要了：%s | 已删除：%s | web i18n.ts, mac loadout.go |
| `loadout.signed_out` | 没登录 | 未登录 | web i18n.ts, mac loadout.go |
| `media.add` | 加图片 | 添加图片 | web i18n.ts, mac i18n.go |
| `media.drop` | 松手就加上 | 松开即可添加 | web i18n.ts, mac i18n.go |
| `media.failed` | 没发出去 | 没能发送 | web i18n.ts, mac i18n.go |
| `media.noImages` | 看不了图片 | 无法显示图片 | web i18n.ts, mac i18n.go |
| `media.remove` | 拿掉 | 移除 | web i18n.ts, mac i18n.go |
| `media.saved` | 存到下载了 | 已存到「下载」 | mac i18n.go |
| `media.tooBig` | 这张太大了 | 图片太大了 | web i18n.ts, mac i18n.go |
| `mem.get` | 装上 Nowledge Mem | 安装 Nowledge Mem | mac onboard.go |
| `memp.ask` | 在 %[2]s 上给 %[1]s 装上 Nowledge Mem？ | 要在 %[2]s 上为 %[1]s 安装 Nowledge Mem 吗？ | web i18n.ts, mac memplugin.go |
| `memp.btn.install` | 装上 | 安装 | web i18n.ts, mac memplugin.go |
| `memp.btn.review` | 理一下 | 检查 | web i18n.ts, mac memplugin.go |
| `memp.cancel` | 算了 | 取消 | web i18n.ts, mac memplugin.go |
| `memp.card.go` | 装上 | 安装 | web i18n.ts, mac memplugin.go |
| `memp.card.hold` | 先不装 | 暂不安装 | web i18n.ts, mac memplugin.go |
| `memp.ok` | 装上 | 安装 | web i18n.ts, mac memplugin.go |
| `memp.review.multiple` | Nowledge Mem 装了不止一份，要看一下 | Nowledge Mem 装了不止一份，需要检查 | web i18n.ts, mac memplugin.go |
| `memp.review.unclear` | 说不好 Nowledge Mem 装好没有，要看一下 | 不确定 Nowledge Mem 装好没有，需要检查 | web i18n.ts, mac memplugin.go |
| `memp.setting` | 正在装 Nowledge Mem… | 正在安装 Nowledge Mem… | web i18n.ts, mac memplugin.go |
| `memp.update` | Nowledge Mem 有新版 | Nowledge Mem 有新版本 | web i18n.ts, mac memplugin.go |
| `memp.why.off` | 记性关着：打开「记住事情」再装。 | 「记住事情」关着：打开以后再装。 | web i18n.ts, mac memplugin.go |
| `menu.rest` | 让 Ducter 歇着 | 让 Ducter 休息 | mac i18n.go |
| `menu.update.ready` | 新版本 %s 已备好… | 新版本 %s 已就绪… | mac lifecycle.go |
| `move.closing.button` | 合上之前搬走 | 合盖前转移 | web i18n.ts, mac where.go |
| `move.closing.go` | 搬走 | 转移 | web i18n.ts, mac where.go |
| `move.closing.hold` | 先不搬 | 暂不转移 | web i18n.ts, mac where.go |
| `move.closing.line` | 合上之前：%[1]s搬到 %[2]s 上接着做；%[3]s只能在 %[4]s 上做，醒了接着。 | 合上之前：%[1]s转到 %[2]s 上接着做；%[3]s只能在 %[4]s 上做，醒了接着。 | web i18n.ts, mac where.go |
| `move.closing.moves` | 合上之前：%[1]s搬到 %[2]s 上接着做。 | 合上之前：%[1]s转到 %[2]s 上接着做。 | web i18n.ts, mac where.go |
| `newtask.addfolder` | 加一个文件夹… | 添加文件夹… | web i18n-starts.ts, mac starts.go |
| `newtask.addfolder.button` | 加进来 | 添加 | web i18n-starts.ts, mac starts.go |
| `newtask.clone` | 从 Git 地址加… | 从 Git 地址添加… | web i18n-starts.ts, mac starts.go |
| `newtask.clone.err.timeout` | 克隆超过 10 分钟，停下了。 | 克隆超过 10 分钟，已停止。 | web i18n-starts.ts, mac starts.go |
| `newtask.clone.title` | 从 Git 地址加到 %s | 从 Git 地址添加到 %s | web i18n-starts.ts, mac starts.go |
| `newtask.find` | 找一个文件夹… | 选择文件夹… | web i18n-starts.ts, mac starts.go |
| `newtask.find.adding` | 在加… | 正在添加… | web i18n-starts.ts, mac starts.go |
| `newtask.keys` | ⌘⏎ %s · ⇧⌘⏎ 开始并接着新建 | ⌘⏎ %s · ⇧⌘⏎ 开始并新建下一件 | web i18n-starts.ts, mac starts.go |
| `newtask.old.why` | 到「设备」里更新它，就能在那儿找文件夹、从 Git 地址加。 | 到「设备」里更新它，就能在那儿找文件夹、从 Git 地址添加。 | web i18n-starts.ts, mac starts.go |
| `newtask.opened` | 开始了：「%s」 | 已开始：「%s」 | web i18n-starts.ts, mac starts.go |
| `newtask.schedule` | 定好 | 安排 | web i18n-starts.ts, mac starts.go |
| `newtask.scheduled` | 定好了：%s ·「%s」 | 已安排：%s ·「%s」 | web i18n-starts.ts, mac starts.go |
| `newtask.when.at` | 定个时间 | 定时 | web i18n-starts.ts, mac starts.go |
| `newtask.when.at.help` | 到点自己开始 | 到时间自动开始 | web i18n-starts.ts, mac starts.go |
| `newtask.when.every` | 定期做 | 定期 | web i18n-starts.ts, mac starts.go |
| `newtask.when.every.help` | 每次到点新建一件 | 每次到时间新建一件 | web i18n-starts.ts, mac starts.go |
| `newtask.when.now.help` | 马上开始 | 立即开始 | web i18n-starts.ts, mac starts.go |
| `newtask.when.until.help` | 没做到就接着再来一次 | 没做到就再试一次 | web i18n-starts.ts, mac starts.go |
| `newtask.when.when` | 等某件事发生 | 等条件满足 | web i18n-starts.ts, mac starts.go |
| `newtask.when.when.help` | 现在新建，先等着，等到了再做 | 现在新建，条件满足后再做 | web i18n-starts.ts, mac starts.go |
| `note.answered` | 你说了：%s | 你说：%s | web i18n.ts, mac accounts.go |
| `note.effort_dropped` | 这里没有「%s」这一档思考深度，按默认的做 | 这里没有「%s」这档思考深度，改用默认的 | web i18n.ts, mac i18n.go |
| `note.keep` | 要 | 保留 | web i18n.ts, mac accounts.go |
| `note.no_more` | 不用了 | 不再需要 | web i18n.ts, mac accounts.go |
| `notify.ask.body` | 窗口关着我也在干活。只在要你拿主意、或者有结果要你看的时候发。macOS 会问你一次。 | 窗口关着我也在工作。只在要你拿主意、或者有结果要你看的时候发。macOS 会问你一次。 | mac onboard.go |
| `notify.later` | 先不用 | 以后再说 | web i18n.ts |
| `notify.test` | 发一条试试 | 发送测试通知 | web i18n.ts |
| `notify.test.sent` | 发出去了，看看这台手机 | 已发送，看看这台手机 | web i18n.ts |
| `onhand.addfolder` | 加一个文件夹 | 添加文件夹 | web i18n-starts.ts, mac starts.go |
| `pair.close` | 关上 | 关闭 | mac i18n.go |
| `pair.connected` | 已连上 | 已连接 | mac i18n.go |
| `pair.title` | 连上手机或另一台电脑 | 连接手机或另一台电脑 | mac i18n.go |
| `partner.face.napping` | 歇着了 | 在休息 | mac ia.go |
| `partner.memory.forgot` | 忘掉了：%s | 已忘掉：%s | web i18n.ts, mac ia.go |
| `partner.memory.off` | 记性关掉了：聊天和做事都不回想，也不记新的。 | 「记住事情」已关闭：聊天和做事都不回想，也不记新的。 | web i18n.ts, mac ia.go |
| `partner.rename.cancel` | 不改了 | 取消 | web i18n.ts, mac ia.go |
| `pay.card` | 用卡 | 付款卡 | web i18n-autofill.ts, mac autofill.go |
| `pay.first` | 第一次在这里付 | 第一次在这里付款 | web i18n-autofill.ts, mac autofill.go |
| `pay.go` | 付 %s | 支付 %s | web i18n-autofill.ts, mac autofill.go |
| `pay.hold` | 先不付 | 暂不付款 | web i18n-autofill.ts, mac autofill.go |
| `pay.resolved.hold` | 没付 | 没有付款 | web i18n-autofill.ts, mac autofill.go |
| `pay.what` | 买的是 | 商品 | web i18n-autofill.ts, mac autofill.go |
| `peers.muted` | 不再听 %s 的 | 不再接收 %s 的消息 | web i18n.ts, mac i18n.go |
| `peers.reach.note` | 你在终端里的 Claude Code、Codex 这些，可以把活交给它，或者把要你定的事发给它。 | 你在终端里的 Claude Code、Codex 这些，可以把事交给它，或者把要你定的事发给它。 | web i18n.ts, mac i18n.go |
| `peers.trust.hold` | 还是先问我 | 仍然先问我 | web i18n.ts, mac i18n.go |
| `peers.trusted` | 你的 %s 发来的活直接接 | 你的 %s 发来的事直接接下 | web i18n.ts, mac i18n.go |
| `peers.trusted.stop` | 不再直接接 | 改回先问我 | web i18n.ts, mac i18n.go |
| `peers.trusted.why` | 你接过两次以后定的 | 你接下两次以后定的 | web i18n.ts, mac i18n.go |
| `phone.offer.go` | 连上 Tuwa | 连接 Tuwa | mac phone.go |
| `phone.offer.going` | 在连… | 正在连接… | mac phone.go |
| `phone.signin.again` | 再来一次 | 再试一次 | mac phone.go |
| `phone.signin.cancel` | 先不连 | 取消 | mac phone.go |
| `phone.stop` | 不用 Tuwa 打电话了 | 断开 Tuwa | mac phone.go |
| `phone.voice.failed` | Tuwa 没办成，过一会儿再试。 | Tuwa 没能完成，过一会儿再试。 | mac phone.go |
| `phone.voice.keep` | 留着 | 保留 | mac phone.go |
| `remove.background` | 只停下并移除后台项 | 只停止并移除后台项 | mac lifecycle.go |
| `remove.done` | Ducter 移除了。 | 已移除 Ducter。 | mac lifecycle.go |
| `remove.keeps` | 会留着 | 会保留 | mac lifecycle.go |
| `remove.removes` | 会删掉 | 会删除 | mac lifecycle.go |
| `report.failed` | 没收集成功：%s | 没能收集：%s | mac lifecycle.go |
| `report.review.with` | 带上了 | 已附上 | mac lifecycle.go |
| `report.review.without` | 没带 | 未附上 | mac lifecycle.go |
| `report.wrote` | 诊断包写到了 {dir}。先看看里面有什么；没有发送到任何地方。 | 诊断包已存到 {dir}。先看看里面有什么；没有发送到任何地方。 | cli i18n.ts |
| `rest.title` | %s 歇着了 | %s 在休息 | mac i18n.go |
| `result.merged.toast` | 「%s」合进去了 · %s | 「%s」已合进 · %s | web i18n.ts, mac i18n.go |
| `result.pr.failed` | 草稿 PR 没开成：%s | 没能开草稿 PR：%s | web i18n.ts, mac i18n.go |
| `result.pr.toast` | 草稿 PR 开好了 · %s | 已开草稿 PR · %s | web i18n.ts, mac i18n.go |
| `result.unsure` | 不确定成没成，你看一眼 | 不确定成功了没有，你看一眼 | web i18n.ts, mac i18n.go |
| `routine.cancel` | 不做了 | 取消 | web i18n-starts.ts, mac starts.go |
| `routine.paused.asked` | 停着 | 已暂停 | web i18n.ts, mac i18n.go |
| `routine.paused.by_partner` | 停着：%s 先停下了 | 已暂停：%s 暂停的 | web i18n.ts, mac i18n.go |
| `routine.resume` | 接着来 | 继续 | web i18n.ts, mac i18n.go |
| `secret.cancel` | 不发了 | 取消 | web i18n.ts, mac i18n.go |
| `secret.send` | 照样发送 | 仍然发送 | web i18n.ts, mac i18n.go |
| `settings.data.allgood` | 都好。 | 一切正常。 | mac ia.go |
| `settings.data.missing` | 缺 | 缺失 | mac ia.go |
| `settings.data.ok` | 好 | 正常 | mac ia.go |
| `settings.devices.link.help` | 在「设备」里登录、安装，连上手机或另一台电脑 | 在「设备」里登录、安装，连接手机或另一台电脑 | mac settings.go |
| `settings.home.ask.body` | 现在用的是 %s 上的 Ducter。这台 Mac 上的对话和任务留在这里（~/.ducter），不会搬过去；搬家以后会有。停掉它也不删任何东西，随时能改回来。 | 现在用的是 %s 上的 Ducter。这台 Mac 上的对话和任务留在这里（~/.ducter），不会迁移过去；迁移以后会有。停用不会删除任何东西，随时能改回来。 | mac ia.go |
| `settings.home.keep` | 留着它 | 保留 | mac ia.go |
| `settings.home.stop` | 停掉它 | 停用 | mac ia.go |
| `settings.lang.auto` | 跟着系统 | 跟随系统 | web i18n.ts, mac ia.go |
| `settings.lang.help` | 只改这扇窗口。它跟你说话用什么语言，在「伙伴」里改。 | 只改这个窗口。它跟你说话用什么语言，在「伙伴」里改。 | mac settings.go |
| `settings.lede.look` | 这扇窗口长什么样、用什么语言、出不出声。只影响这台 Mac。 | 这个窗口的外观、语言和声音。只影响这台 Mac。 | mac settings.go |
| `settings.rest.go` | 歇着 | 休息 | mac settings.go |
| `settings.run.apart` | %s 在这台电脑上自己运行，不跟着窗口。关掉窗口，它照样干活。 | %s 在这台电脑上自己运行，不跟着窗口。关掉窗口，它照常工作。 | mac ia.go |
| `settings.run.bg` | %s 接着干活。电脑重启、你登录以后，它也会自己醒来。 | %s 继续工作。电脑重启、你登录以后，它也会自己醒来。 | mac ia.go |
| `settings.run.remote` | %s 在 %s 上，不在这台电脑里。关掉窗口，它照样干活。 | %s 在 %s 上，不在这台电脑里。关掉窗口，它照常工作。 | mac ia.go |
| `settings.run.resting` | %s 歇着了，直到你叫醒它。 | %s 在休息，直到你叫醒它。 | mac ia.go |
| `settings.sound.play` | 听一下 | 试听 | mac settings.go |
| `settings.sound.stop` | 停 | 停止 | mac settings.go |
| `settings.where.elsewhere.help` | 比如装在服务器上的 Ducter，用一次性的配对码连上。 | 比如装在服务器上的 Ducter，用一次性的连接码连上。 | mac settings.go |
| `setup.blocked.body` | Ducter 用你已有的 AI 订阅干活（Claude Code 或 Codex）。先把这个补上： | Ducter 用你已有的 AI 订阅工作（Claude Code 或 Codex）。先把这个补上： | mac i18n.go |
| `setup.pick.body` | Ducter 用你已有的 AI 订阅干活。选一个，装好、登录就行： | Ducter 用你已有的 AI 订阅工作。选一个，装好、登录就行： | mac onboard.go |
| `setup.ran` | 终端开好了 | 已打开终端 | mac i18n.go |
| `setup.ready` | 好了 | 一切就绪 | mac onboard.go |
| `setup.starting.bg` | 就在这台 Mac 上，几秒钟。以后关掉窗口，%s 也照样在后台干活；要它停下，在菜单里选「让 Ducter 歇着」。 | 就在这台 Mac 上，几秒钟。以后关掉窗口，%s 也照样在后台工作；要它停下，在菜单里选「让 Ducter 休息」。 | mac i18n.go |
| `sheet.close` | 关上 | 关闭 | web i18n.ts |
| `signin.later` | 先不用 | 暂不登录 | web i18n.ts, mac i18n.go |
| `signin.resolved` | 登录好了 | 已登录 | web i18n.ts, mac i18n.go |
| `signin.resolved.hold` | 先不登录 | 暂不登录 | web i18n.ts, mac i18n.go |
| `sites.clear` | 全部清掉 | 全部清除 | web i18n.ts, mac i18n.go |
| `sites.clear.ask` | 清掉以后，这些网站都要你重新登录。 | 清除以后，这些网站都要你重新登录。 | web i18n.ts, mac i18n.go |
| `sites.clear.go` | 清掉 | 清除 | web i18n.ts, mac i18n.go |
| `sites.keep` | 先留着 | 取消 | web i18n.ts, mac i18n.go |
| `state.dropped` | 不做了 | 已取消 | web i18n.ts, mac i18n.go |
| `step.browsed.scroll` | 翻了翻页面 | 滚动了页面 | web i18n.ts, mac i18n.go |
| `step.computer.pointer` | 移了指针 | 移动了指针 | web i18n.ts, mac i18n.go |
| `step.computer.scroll` | 翻了翻 | 滚动了一下 | web i18n.ts, mac i18n.go |
| `step.label.other` | 用了 | 使用 | web i18n.ts, mac i18n.go |
| `step.ran.mem_connect` | 连上 Mem | 连接 Mem | web i18n.ts, mac i18n.go |
| `step.ran.mem_search` | 在 Mem 里搜了搜 | 搜索 Mem | web i18n.ts, mac i18n.go |
| `step.ran.pr_look` | 看 PR 的状态 | 查看 PR 状态 | web i18n.ts, mac i18n.go |
| `step.read.exists` | 看看 %[1]s 在不在 | 看 %[1]s 是否存在 | web i18n.ts, mac i18n.go |
| `step.searched.files` | 找 %[1]s | 查找 %[1]s | web i18n.ts, mac i18n.go |
| `switch.cant.folder` | 文件夹在别的电脑上，搬不走 | 文件夹在另一台电脑上，转不过去 | web i18n.ts, mac where.go |
| `switch.move.signin` | 那边没登录这个网站，得你登一下。 | 那边没登录这个网站，需要你登录一下。 | web i18n.ts, mac where.go |
| `tail.state.done_claimed` | 做完了 · 在核对 | 做完了 · 在检查 | cli i18n.ts |
| `tail.state.dropped` | 不做了 | 已取消 | cli i18n.ts |
| `tail.state.queued` | 排着 | 还没开始 | cli i18n.ts |
| `tail.state.superseded` | 换掉了 | 换到别处接着做了 | cli i18n.ts |
| `task.action.drop` | 不做了 | 取消任务 | web i18n.ts, mac i18n.go |
| `task.footer.took` | 用了 %s | 用时 %s | web i18n.ts, mac i18n.go |
| `task.kickoff` | 交代给它了，开始做 | 交给它了，开始做 | mac i18n.go |
| `task.loading` | 正在读这件事的记录… | 正在加载… | web i18n.ts, mac i18n.go |
| `task.open.finder` | 在 Finder 中显示 | 在访达中显示 | mac openin.go |
| `task.session.started` | 开工了 | 开始了 | mac i18n.go |
| `task.transcript.hint` | 细节收起来了 | 细节已收起 | web i18n.ts, mac i18n.go |
| `task.your.turn` | 该你了 | 等你回复 | web i18n.ts, mac i18n.go |
| `task.your.turn.hint` | 它停在这儿了。回它一句，它就接着做。 | 它停在这里了，回复后会接着做。 | web i18n.ts, mac i18n.go |
| `tile.more` | 再连一个 | 再连接一个 | web i18n.ts, mac accounts.go |
| `tile.more.oo` | 在 oo 里再连一个 | 在 oo 里再连接一个 | web i18n.ts, mac accounts.go |
| `tile.more.oomol` | 在 OOMOL 里再连一个 | 在 OOMOL 里再连接一个 | web i18n.ts, mac accounts.go |
| `token.failed` | 没成，再试一次 | 没能完成，再试一次 | mac ia.go |
| `token.install` | 装上 | 安装 | mac ia.go |
| `token.installing` | 在装… | 正在安装… | mac ia.go |
| `token.missing` | 没装 | 未安装 | mac i18n.go |
| `token.signed_out` | 没登录 | 未登录 | mac i18n.go |
| `token.signingout` | 在退出… | 正在退出… | mac ia.go |
| `undo.confirm` | 加上 --yes 再运行一次，就照样改回去。 | 加上 --yes 再运行一次，就会还原。 | cli i18n.ts |
| `undo.dropped` | 「%s」不做了 | 已取消「%s」 | web i18n.ts, mac i18n.go |
| `undo.failed` | 连不上端口 {port} 上的 Ducter，没能改回去。 | 连不上端口 {port} 上的 Ducter，没能还原。 | cli i18n.ts |
| `undo.none` | 没有还能改回去的文件夹任务对得上「{name}」。 | 没有能还原的文件夹任务对得上「{name}」。 | cli i18n.ts |
| `uninstall.done` | 移除了 {n} 项。 | 已移除 {n} 项。 | cli i18n.ts |
| `until.stop` | 停下 | 停止 | web i18n.ts, mac i18n.go |
| `update.checknow` | 现在检查 | 检查更新 | mac lifecycle.go |
| `update.failed` | 这次没更新成功 | 这次没能更新 | mac lifecycle.go |
| `update.how.source` | 这个 Ducter 是从源码跑的：用 git 更新，再重启它。 | 这个 Ducter 是从源码运行的：用 git 更新，再重启它。 | cli i18n.ts |
| `update.phase.done` | 回来了，现在是 {v} | 已更新到 {v} | cli i18n.ts |
| `update.phase.failed` | 没更新成 | 没能更新 | cli i18n.ts |
| `update.phase.waiting` | 等手头的事停好… | 等手头的事停下… | cli i18n.ts |
| `update.reason.health` | 新版本没起来，已经换回原来的 | 新版本没能启动，已经换回原来的 | cli i18n.ts |
| `update.reason.install` | 上次没换成：Ducter.app 没能被替换，打开的还是旧版本。再点一次重启更新试试。 | 上次没能换上新版本：Ducter.app 没能被替换，打开的还是旧版本。再点一次重启更新试试。 | mac lifecycle.go |
| `update.reason.source` | 它是从源码跑的 | 它是从源码运行的 | cli i18n.ts |
| `update.rolledBack` | 没更新成，已经换回 {v}：{why} | 没能更新，已经换回 {v}：{why} | cli i18n.ts |
| `update.unread` | 这次没查成 | 这次没能检查 | mac lifecycle.go |
| `wait.cancel` | 不等了 | 停止等待 | web i18n.ts, mac i18n.go |
| `wait.look` | 现在看一眼 | 立即查看 | web i18n.ts, mac i18n.go |
| `wait.rearm` | 接着等 | 继续等 | web i18n.ts, mac i18n.go |
| `web.add` | 装上 | 安装 | web i18n.ts |
| `web.done` | 好了 | 完成 | mac onboard.go |
| `web.driver` | 装上浏览器驱动 | 安装浏览器驱动 | mac onboard.go |
| `web.entry.start` | 一步步装上 | 开始安装 | mac onboard.go |
| `web.grant.open` | 带我去设置 | 前往设置 | mac onboard.go |
| `web.installing` | 正在装浏览器……第一次要下载一会儿 | 正在安装浏览器……第一次要下载一会儿 | web i18n.ts, mac i18n.go |
| `web.installing.short` | 正在装…… | 正在安装…… | mac i18n.go |
| `where.ask.signin` | %[1]s 那边没登录 %[2]s，得你登一下。 | %[1]s 那边没登录 %[2]s，需要你登录一下。 | web i18n.ts, mac where.go |
| `where.ask.signin.0` | %s 那边没登录这个网站，得你登一下。 | %s 那边没登录这个网站，需要你登录一下。 | web i18n.ts, mac where.go |
| `who.failed` | 没换成：%s | 没能更换：%s | web i18n.ts, mac loadout.go |
| `work.mac.starting` | 在连上… | 正在连接… | mac computers.go |
| `work.mac.stopping` | 在停下… | 正在停止… | mac computers.go |
| `worker.connected` | 已连上 {url}，名字是 {name}。这个命令运行期间，这台机器随时可用（Ctrl-C 停止）。 | 已连接 {url}，名字是 {name}。这个命令运行期间，这台机器随时可用（Ctrl-C 停止）。 | cli i18n.ts |
| `worker.lost` | 和 {url} 断开了；{s} 秒后再连… | 和 {url} 断开了；{s} 秒后重新连接… | cli i18n.ts |
| `worker.usage` | 用法：ducter worker <地址> --code <连接码> [--name <名字>]（码在 Ducter 住的那台电脑上拿：ducter pair，或者应用里的「连上手机或另一台电脑」） | 用法：ducter worker <地址> --code <连接码> [--name <名字>]（码在 Ducter 住的那台电脑上拿：ducter pair，或者应用里的「连接手机或另一台电脑」） | cli i18n.ts |
| `devup.checked.now` | 刚查过 | 刚检查过 | web i18n.ts, mac devupdate.go |
| core `phone.ts` call card | 打过去 · 到点再打 · 现在就打 | 拨打 · 到时拨打 · 立即拨打 | core |
| core `closing.ts` closing card | …搬到 X 上接着做 · Go 搬走 | …转到 X 上接着做 · Go 转移 | core |
| core `mem-plugins.ts` card and task | 装上 · 给 X 上的 Y 装上 Nowledge Mem | 安装 · 为 X 上的 Y 安装 Nowledge Mem | core |
| core `routines.ts` review card Go | 留着 | 保留 | core |
| core `push.ts` test push | 通知通了。需要你的时候，我会这样叫你。 | 通知设好了。需要你的时候，我会这样告诉你。 | core |
| partner `partner.ts` trust card | 以后你的 X 发来的活，直接接？ · 直接接 | 以后你的 X 发来的事，直接接下？ · 直接接下 | partner |
| iOS `connect.go` · `conn.connecting` · `connect.app.or` · `notify.action.failed` | 连上 · 正在连上… · 或者手动填 · 没发出去。打开 Ducter 在那里回一下。 | 连接 · 正在连接… · 或者手动填写 · 没能发送。打开 Ducter 在那里回复。 | ios |
| Android `connect_go` · `conn_connecting` · `connect_or` | 连上 · 正在连上… · 或者手动填 | 连接 · 正在连接… · 或者手动填写 | android |
| Android `update_*` | 在下载 · 在核对 · 在安装 · 回来了，现在是 X · 在查… · 去打开 · 没更新成 · 这次新的 | 正在下载 · 正在核对 · 正在安装 · 已更新到 X · 正在检查… · 前往设置 · 没能更新 · 更新内容 | android |
