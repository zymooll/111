import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import type { CatalogMetadata, MenuItem, Merchant, PublishStatus } from '../types';

export function CatalogPage() {
  return (
    <div>
      <PageHeader title="商家与菜品" description="维护商家档案、营业状态以及可推荐的菜品和套餐" />
      <Card bordered={false} className="catalog-card">
        <Tabs
          defaultActiveKey="merchants"
          items={[
            { key: 'merchants', label: '商家管理', children: <MerchantPanel /> },
            { key: 'items', label: '菜品 / 套餐管理', children: <MenuItemPanel /> },
          ]}
        />
      </Card>
    </div>
  );
}

function MerchantPanel() {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<Merchant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Merchant>();
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState<CatalogMetadata>({ areas: [], categories: [] });
  const [form] = Form.useForm<Merchant>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, metadataResult] = await Promise.all([
        adminApi.merchants({ keyword, status, page, pageSize: 10 }),
        adminApi.catalogMetadata(),
      ]);
      setMetadata(metadataResult);
      setItems(result.items.map((item) => ({
        ...item,
        area: metadataResult.areas.find((entry) => entry.id === item.areaId)?.name ?? item.area,
        category: metadataResult.categories.find((entry) => entry.id === item.categoryId)?.name ?? item.category,
      })));
      setTotal(result.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '商家列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, message, page, status]);

  useEffect(() => { void load(); }, [load]);

  const edit = (record?: Merchant) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(record ? {
      ...record,
      areaId: record.areaId ?? metadata.areas.find((entry) => entry.name === record.area)?.id,
      categoryId: record.categoryId ?? metadata.categories.find((entry) => entry.name === record.category)?.id,
    } : ({ status: 'draft', openingHours: '10:00-20:00', latitude: 39.9, longitude: 116.4, priceLevel: 2 } as Merchant));
    setOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminApi.saveMerchant({
        ...editing,
        ...values,
        area: metadata.areas.find((entry) => entry.id === values.areaId)?.name ?? editing?.area ?? '未分区',
        category: metadata.categories.find((entry) => entry.id === values.categoryId)?.name ?? editing?.category ?? '未分类',
      });
      message.success(editing ? '商家信息已更新' : '商家已创建');
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (record: Merchant, next: PublishStatus) => {
    modal.confirm({
      title: `${next === 'online' ? '上架' : '下架'}商家“${record.name}”？`,
      content: next === 'offline' ? '商家下架后不会出现在搜索、推荐和地图结果中。' : '请确认营业信息和菜品数据已完成核验。',
      okText: `确认${next === 'online' ? '上架' : '下架'}`,
      okButtonProps: { danger: next === 'offline' },
      async onOk() {
        await adminApi.updateMerchantStatus(record.id, next);
        message.success(`商家已${next === 'online' ? '上架' : '下架'}`);
        await load();
      },
    });
  };

  const remove = (record: Merchant) => {
    modal.confirm({
      title: `删除商家“${record.name}”？`,
      content: '管理端将执行软删除，关联菜品停止展示；历史评价和审计记录仍会保留。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      async onOk() {
        await adminApi.deleteMerchant(record.id);
        message.success('商家档案已删除');
        await load();
      },
    });
  };

  const columns: ColumnsType<Merchant> = [
    { title: '商家', key: 'merchant', width: 240, render: (_, record) => <div className="table-primary"><strong>{record.name}</strong><span>{record.id} · {record.address}</span></div> },
    { title: '区域', dataIndex: 'area', width: 140 },
    { title: '类别', dataIndex: 'category', width: 120 },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => <StatusTag status={value} /> },
    { title: '评分', dataIndex: 'rating', width: 90, render: (value: number) => value ? <span className="rating-value">★ {value.toFixed(1)}</span> : '暂无' },
    { title: '菜品数', dataIndex: 'dishCount', width: 90, render: (value) => `${value} 个` },
    { title: '收藏', dataIndex: 'favoriteCount', width: 90 },
    { title: '营业时间', dataIndex: 'openingHours', width: 130 },
    {
      title: '操作', key: 'actions', fixed: 'right', width: 170,
      render: (_, record) => <Space size={2}>
        <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} onClick={() => edit(record)} /></Tooltip>
        {record.status === 'online'
          ? <Tooltip title="下架"><Button danger type="text" icon={<StopOutlined />} onClick={() => changeStatus(record, 'offline')} /></Tooltip>
          : <Tooltip title="上架"><Button type="text" icon={<UploadOutlined />} onClick={() => changeStatus(record, 'online')} /></Tooltip>}
        {record.status !== 'online' && <Tooltip title="删除"><Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(record)} /></Tooltip>}
      </Space>,
    },
  ];

  return (
    <>
      <div className="table-toolbar">
        <Space wrap>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索商家、区域或类别" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} className="wide-search" />
          <Select value={status} onChange={(value) => { setStatus(value); setPage(1); }} style={{ width: 132 }} options={[{ value: '', label: '全部状态' }, { value: 'online', label: '已上架' }, { value: 'offline', label: '已下架' }, { value: 'draft', label: '草稿' }]} />
        </Space>
        <Space><Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>新增商家</Button></Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        scroll={{ x: 1120 }}
        pagination={{ current: page, pageSize: 10, total, showTotal: (value) => `共 ${value} 家商家`, onChange: setPage }}
      />
      <Modal title={editing ? '编辑商家' : '新增商家'} width={680} open={open} onCancel={() => setOpen(false)} onOk={() => void save()} confirmLoading={saving} okText="保存">
        <Form form={form} layout="vertical" requiredMark={false} className="modal-form-grid">
          <Form.Item label="商家名称" name="name" rules={[{ required: true, message: '请输入商家名称' }]}><Input placeholder="如：学苑一食堂·风味档口" /></Form.Item>
          <Form.Item label="所属区域" name="areaId" rules={[{ required: true, message: '请选择所属区域' }]}><Select showSearch optionFilterProp="label" placeholder="选择校园地点" options={metadata.areas.map((entry) => ({ value: entry.id, label: entry.name }))} /></Form.Item>
          <Form.Item label="餐饮类别" name="categoryId" rules={[{ required: true, message: '请选择餐饮类别' }]}><Select showSearch optionFilterProp="label" options={metadata.categories.map((entry) => ({ value: entry.id, label: entry.name }))} /></Form.Item>
          <Form.Item label="初始状态" name="status" rules={[{ required: true }]}><Select options={[{ value: 'draft', label: '草稿' }, { value: 'online', label: '已上架' }, { value: 'offline', label: '已下架' }]} /></Form.Item>
          <Form.Item label="详细地址" name="address" rules={[{ required: true, message: '请输入详细地址' }]} className="form-span-2"><Input placeholder="用于地图定位和地点筛选" /></Form.Item>
          <Form.Item label="商家简介" name="description" className="form-span-2"><Input.TextArea rows={3} maxLength={500} showCount placeholder="介绍主营特色、服务信息等" /></Form.Item>
          <Form.Item label="纬度（WGS-84）" name="latitude" rules={[{ required: true, message: '请输入纬度' }]}><InputNumber min={-90} max={90} precision={6} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="经度（WGS-84）" name="longitude" rules={[{ required: true, message: '请输入经度' }]}><InputNumber min={-180} max={180} precision={6} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="营业时间" name="openingHours" rules={[{ required: true, message: '请输入营业时间' }]}><Input placeholder="06:30-21:00" /></Form.Item>
          <Form.Item label="价格等级" name="priceLevel"><Select options={[1, 2, 3, 4].map((value) => ({ value, label: `${'¥'.repeat(value)} · ${value} 级` }))} /></Form.Item>
          <Form.Item label="联系电话" name="contact" className="form-span-2"><Input placeholder="商家联系电话（后端接口预留）" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function MenuItemPanel() {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem>();
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState<CatalogMetadata>({ areas: [], categories: [] });
  const [form] = Form.useForm<MenuItem>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, merchantResult, metadataResult] = await Promise.all([
        adminApi.menuItems({ keyword, status, page, pageSize: 10 }),
        adminApi.merchants({ page: 1, pageSize: 100 }),
        adminApi.catalogMetadata(),
      ]);
      setMetadata(metadataResult);
      setItems(result.items.map((item) => ({
        ...item,
        category: metadataResult.categories.find((entry) => entry.id === item.categoryId)?.name ?? item.category,
      })));
      setTotal(result.total);
      setMerchants(merchantResult.items);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '菜品列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, message, page, status]);

  useEffect(() => { void load(); }, [load]);

  const edit = (record?: MenuItem) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(record ? {
      ...record,
      categoryId: record.categoryId ?? metadata.categories.find((entry) => entry.name === record.category)?.id,
    } : { type: 'dish', status: 'draft', tags: [], imageUrl: '/images/dish-placeholder.webp' });
    setOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminApi.saveMenuItem({
        ...editing,
        ...values,
        category: metadata.categories.find((entry) => entry.id === values.categoryId)?.name ?? editing?.category ?? '未分类',
      });
      message.success(editing ? '菜品信息已更新' : '菜品已创建');
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (record: MenuItem, next: PublishStatus) => {
    modal.confirm({
      title: `${next === 'online' ? '上架' : '下架'}“${record.name}”？`,
      content: next === 'offline' ? '下架后该菜品不会参与召回和推荐。' : '上架后将进入用户端的搜索与推荐候选池。',
      okText: `确认${next === 'online' ? '上架' : '下架'}`,
      okButtonProps: { danger: next === 'offline' },
      async onOk() {
        await adminApi.updateMenuItemStatus(record.id, next);
        message.success(`菜品已${next === 'online' ? '上架' : '下架'}`);
        await load();
      },
    });
  };

  const remove = (record: MenuItem) => {
    modal.confirm({
      title: `删除“${record.name}”？`,
      content: '管理端将执行软删除，历史评价与审计记录仍会保留。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      async onOk() {
        await adminApi.deleteMenuItem(record.id);
        message.success('菜品档案已删除');
        await load();
      },
    });
  };

  const columns: ColumnsType<MenuItem> = [
    { title: '菜品 / 套餐', key: 'item', width: 250, render: (_, record) => <div className="table-primary"><strong>{record.name} <Tag>{record.type === 'dish' ? '菜品' : '套餐'}</Tag></strong><span>{record.id} · {record.merchantName}</span></div> },
    { title: '分类', dataIndex: 'category', width: 110 },
    { title: '价格', dataIndex: 'price', width: 90, render: (value: number) => `¥${value.toFixed(2)}` },
    { title: '标签', dataIndex: 'tags', width: 180, render: (tags: string[]) => tags.map((tag) => <Tag key={tag}>{tag}</Tag>) },
    { title: '评分', dataIndex: 'rating', width: 90, render: (value: number) => value ? <span className="rating-value">★ {value.toFixed(1)}</span> : '暂无' },
    { title: '评价数', dataIndex: 'reviewCount', width: 90 },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => <StatusTag status={value} /> },
    {
      title: '操作', key: 'actions', fixed: 'right', width: 170,
      render: (_, record) => <Space size={2}>
        <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} onClick={() => edit(record)} /></Tooltip>
        {record.status === 'online'
          ? <Tooltip title="下架"><Button danger type="text" icon={<StopOutlined />} onClick={() => changeStatus(record, 'offline')} /></Tooltip>
          : <Tooltip title="上架"><Button type="text" icon={<UploadOutlined />} onClick={() => changeStatus(record, 'online')} /></Tooltip>}
        {record.status !== 'online' && <Tooltip title="删除"><Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(record)} /></Tooltip>}
      </Space>,
    },
  ];

  return (
    <>
      <div className="table-toolbar">
        <Space wrap>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索菜品、套餐或所属商家" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} className="wide-search" />
          <Select value={status} onChange={(value) => { setStatus(value); setPage(1); }} style={{ width: 132 }} options={[{ value: '', label: '全部状态' }, { value: 'online', label: '已上架' }, { value: 'offline', label: '已下架' }, { value: 'draft', label: '草稿' }]} />
        </Space>
        <Space><Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>新增菜品 / 套餐</Button></Space>
      </div>
      <Table rowKey="id" columns={columns} dataSource={items} loading={loading} scroll={{ x: 1100 }} pagination={{ current: page, pageSize: 10, total, showTotal: (value) => `共 ${value} 个项目`, onChange: setPage }} />
      <Modal title={editing ? '编辑菜品 / 套餐' : '新增菜品 / 套餐'} width={680} open={open} onCancel={() => setOpen(false)} onOk={() => void save()} confirmLoading={saving} okText="保存">
        <Form form={form} layout="vertical" requiredMark={false} className="modal-form-grid">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}><Input placeholder="菜品或套餐名称" /></Form.Item>
          <Form.Item label="所属商家" name="merchantId" rules={[{ required: true, message: '请选择商家' }]}><Select showSearch optionFilterProp="label" options={merchants.map((merchant) => ({ value: merchant.id, label: merchant.name }))} /></Form.Item>
          <Form.Item label="类型" name="type" rules={[{ required: true }]}><Select options={[{ value: 'dish', label: '菜品' }, { value: 'combo', label: '套餐' }]} /></Form.Item>
          <Form.Item label="分类" name="categoryId" rules={[{ required: true, message: '请选择分类' }]}><Select showSearch optionFilterProp="label" options={metadata.categories.map((entry) => ({ value: entry.id, label: entry.name }))} /></Form.Item>
          <Form.Item label="价格" name="price" rules={[{ required: true, message: '请输入价格' }]}><InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="状态" name="status"><Select options={[{ value: 'draft', label: '草稿' }, { value: 'online', label: '已上架' }, { value: 'offline', label: '已下架' }]} /></Form.Item>
          <Form.Item label="简介" name="description" className="form-span-2"><Input.TextArea rows={3} maxLength={500} showCount placeholder="描述主要食材、分量或口味特点" /></Form.Item>
          <Form.Item label="菜品图片 URL" name="imageUrl" className="form-span-2"><Input placeholder="/images/dish-placeholder.webp" /></Form.Item>
          <Form.Item label="口味 / 特征标签" name="tags" className="form-span-2"><Select mode="tags" tokenSeparators={[',', '，']} placeholder="输入后回车，例如：微辣、高蛋白" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
