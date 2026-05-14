import { AppShell } from "@/components/layout/app-shell";

export default function GuidePage() {
  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">使用文档</h1>
        <p className="mt-2 text-sm text-slate-400">
          这份文档面向使用者，说明如何申请工作区、查看账号信息，以及使用自己的账号密码远程连接服务器。
        </p>

        <div className="mt-6 space-y-6">
          <Section
            title="1. 进入系统后先看哪里"
            lines={[
              "数据总览：只展示你自己已获批的工作区账号与服务器信息。",
              "工作区申请：提交新的工作区需求，并在右侧查看自己的历史申请记录。",
              "账号状态：查看连接地址、账号、密码、到期时间和工作目录。",
              "端口安全：查看自己服务器的端口占用情况，并提交端口开放或关闭申请。",
            ]}
          />

          <Section
            title="2. 如何申请工作区"
            lines={[
              "进入“工作区申请”页面。",
              "选择用途、使用时长，以及是否指定服务器；不指定时会由系统或管理员分配。",
              "填写 CPU、内存、磁盘、端口数量、所需环境等信息。",
              "提交后在右侧“历史申请记录”查看审批状态。",
              "审批通过后，系统会为你生成专属工作区账号，并出现在“账号状态”页面。",
            ]}
          />

          <Section
            title="3. 如何查看自己的账号信息"
            lines={[
              "进入“账号状态”页面。",
              "每一张卡片就是一个已经分配给你的工作区账号。",
              "重点查看：连接地址、登录账号、登录密码、工作目录、资源配额和到期时间。",
              "如果密码变更或工作区到期，页面信息会同步更新。",
            ]}
          />

          <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-6">
            <h2 className="text-xl font-medium text-cyan-100">4. 如何远程连接服务器</h2>
            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <p>在“账号状态”页面找到下面四项：</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>连接地址，例如 `101.42.14.129:22042`</li>
                <li>登录账号，例如 `user4u6k`</li>
                <li>登录密码</li>
                <li>工作目录</li>
              </ul>

              <div>
                <div className="mb-2 text-cyan-100">Windows PowerShell / macOS / Linux 终端</div>
                <pre className="overflow-x-auto rounded-lg bg-[#031224] p-4 text-cyan-100">
{`ssh 用户名@服务器IP -p 端口

示例：
ssh user4u6k@101.42.14.129 -p 22042`}
                </pre>
              </div>

              <div>
                <div className="mb-2 text-cyan-100">连接后输入密码</div>
                <p>
                  首次连接时终端可能会提示你确认主机指纹，输入 `yes` 后回车，再输入“账号状态”页里显示的密码即可。
                </p>
              </div>

              <div>
                <div className="mb-2 text-cyan-100">VS Code Remote SSH</div>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>安装 `Remote - SSH` 扩展。</li>
                  <li>按 `Ctrl+Shift+P`，选择 `Remote-SSH: Connect to Host...`。</li>
                  <li>输入 `ssh 用户名@服务器IP -p 端口`。</li>
                  <li>根据提示输入密码，即可在 VS Code 中打开远程环境。</li>
                </ol>
              </div>
            </div>
          </div>

          <Section
            title="5. 使用过程中的常见动作"
            lines={[
              "需要更多资源：重新提交工作区申请，说明新增需求。",
              "需要业务端口：进入“端口安全”提交开放或关闭端口申请。",
              "发现账号无法连接：先检查账号状态中的到期时间、服务器状态和连接地址是否变化。",
              "工作区到期前建议提前申请续期，避免环境被回收。",
            ]}
          />
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-6">
      <h2 className="text-xl font-medium text-cyan-100">{title}</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
