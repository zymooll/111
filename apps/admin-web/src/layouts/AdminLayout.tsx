import {
  AppstoreOutlined,
  AuditOutlined,
  DownOutlined,
  ImportOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ShopOutlined,
  StarFilled,
  TeamOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiMode, isFallbackActive, onFallbackChange } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const { Header, Sider, Content } = Layout;

const roleLabel = {
  super_admin: '超级管理员',
  campus_admin: '校园管理员',
  review_moderator: '评价审核员',
};

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [degraded, setDegraded] = useState(isFallbackActive);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => onFallbackChange(setDegraded), []);

  const selectedKey = useMemo(() => {
    const match = ['/dashboard', '/users', '/catalog', '/reviews', '/imports', '/audit-logs'].find((path) => location.pathname.startsWith(path));
    return match ?? '/dashboard';
  }, [location.pathname]);

  const items = [
    { key: '/dashboard', icon: <AppstoreOutlined />, label: '运营概览' },
    { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
    { key: '/catalog', icon: <ShopOutlined />, label: '商家与菜品' },
    { key: '/reviews', icon: <AuditOutlined />, label: '评价审核' },
    { key: '/imports', icon: <ImportOutlined />, label: 'CSV 数据导入' },
    { key: '/audit-logs', icon: <AuditOutlined />, label: '审计日志' },
  ].filter((item) => user?.role !== 'review_moderator' || ['/dashboard', '/reviews'].includes(item.key));

  return (
    <Layout className="admin-shell">
      <Sider width={240} collapsedWidth={76} collapsible collapsed={collapsed} trigger={null} className="admin-sider">
        <div className={collapsed ? 'admin-brand admin-brand-collapsed' : 'admin-brand'}>
          <div className="brand-mark"><StarFilled /></div>
          {!collapsed && <div><strong>Campus Foodie</strong><span>管理后台</span></div>}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          onClick={({ key }) => navigate(key)}
          className="admin-menu"
        />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <Space size="middle">
            <Button
              type="text"
              aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
            />
            <div className="campus-selector">
              <span>当前校园</span>
              <strong>{user?.campusName}</strong>
            </div>
            {apiMode === 'mock' && <Tag color="blue">Mock API</Tag>}
            {degraded && (
              <Tooltip title="后端暂不可用，列表展示的是内置演示数据；写操作仍会真实提交并在失败时报错。">
                <Tag color="orange">演示数据（后端不可用）</Tag>
              </Tooltip>
            )}
          </Space>
          <Dropdown
            menu={{
              items: [
                { key: 'profile', label: <div><strong>{user?.name}</strong><br /><Typography.Text type="secondary">{user ? roleLabel[user.role] : ''}</Typography.Text></div>, disabled: true },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
              ],
              onClick: ({ key }) => { if (key === 'logout') logout(); },
            }}
            placement="bottomRight"
          >
            <Button type="text" className="admin-profile">
              <Avatar>{user?.name.slice(0, 1)}</Avatar>
              <span>{user?.name}</span>
              <DownOutlined />
            </Button>
          </Dropdown>
        </Header>
        <Content className="admin-content"><Outlet /></Content>
      </Layout>
    </Layout>
  );
}
