import { LockOutlined, SafetyCertificateOutlined, StarFilled, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Tag, Typography, message } from 'antd';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { apiMode } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

interface LoginForm {
  username: string;
  password: string;
}

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (values: LoginForm) => {
    try {
      await login(values.username, values.password);
      message.success('登录成功');
      const target = (location.state as { from?: string } | null)?.from || '/dashboard';
      navigate(target, { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登录失败，请稍后重试');
    }
  };

  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="login-brand"><span><StarFilled /></span> Campus Foodie</div>
        <div className="showcase-copy">
          <Tag color="blue">校园饮食推荐系统</Tag>
          <h1>让校园里的每一餐<br />都值得期待</h1>
          <p>统一管理用户、商家、菜品与评价，让可信数据持续驱动个性化推荐。</p>
          <div className="showcase-metrics">
            <div><strong>12,846</strong><span>活跃用户</span></div>
            <div><strong>1,842</strong><span>在售菜品</span></div>
            <div><strong>98.6%</strong><span>审核及时率</span></div>
          </div>
        </div>
        <div className="showcase-orb showcase-orb-one" />
        <div className="showcase-orb showcase-orb-two" />
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="login-security"><SafetyCertificateOutlined /></div>
          <Typography.Title level={2}>管理端登录</Typography.Title>
          <Typography.Paragraph type="secondary">请使用管理员账号继续</Typography.Paragraph>
          {apiMode !== 'remote' && (
            <Alert
              type="info"
              showIcon
              message="演示环境已启用 Mock API"
              description={<span>账号 <code>admin</code>，密码 <code>admin123</code></span>}
              className="login-alert"
            />
          )}
          <Form<LoginForm>
            layout="vertical"
            size="large"
            initialValues={apiMode !== 'remote' ? { username: 'admin', password: 'admin123' } : undefined}
            onFinish={submit}
            requiredMark={false}
          >
            <Form.Item label="管理员账号" name="username" rules={[{ required: true, message: '请输入管理员账号' }]}>
              <Input prefix={<UserOutlined />} placeholder="请输入账号" autoComplete="username" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} className="login-submit">登录管理后台</Button>
          </Form>
          <p className="login-note">此入口仅供授权管理员使用，所有操作均会记录至审计日志。</p>
        </div>
      </section>
    </main>
  );
}
