import { useState, type FormEvent } from 'react'
import { Button, Toast } from 'antd-mobile'
import { Mail, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { api } from '../services/api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [debugToken, setDebugToken] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      const result = await api.forgotPassword(email)
      setMessage(result.message)
      setDebugToken(result.debugToken || '')
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '发送失败' })
    } finally { setLoading(false) }
  }

  return (
    <div className="page auth-page">
      <PageHeader title="找回密码" />
      <section className="auth-copy"><h1>通过邮箱重置密码</h1><p>我们会向已验证邮箱发送一次性重置链接</p></section>
      <form className="auth-form" onSubmit={submit}>
        <label><span>邮箱</span><div className="form-control"><Mail size={19} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="请输入注册邮箱" required /></div></label>
        <Button loading={loading} block color="primary" size="large" type="submit" disabled={!email}><Send size={17} /> 发送重置邮件</Button>
      </form>
      {message && <div className="auth-result"><strong>{message}</strong>{debugToken && <Link to={`/reset-password?token=${encodeURIComponent(debugToken)}`}>开发环境：直接打开重置页面</Link>}</div>}
      <p className="auth-switch"><Link to="/login">返回登录</Link></p>
    </div>
  )
}
