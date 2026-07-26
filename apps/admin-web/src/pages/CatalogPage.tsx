import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, StopOutlined, TagsOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { CursorPagination } from '../components/CursorPagination';
import { LocationPicker } from '../components/LocationPicker';
import { MerchantSelect } from '../components/MerchantSelect';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import { CAMPUS_CENTER_WGS84 } from '../constants/campus';
import { useCursorList } from '../hooks/useCursorList';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { CatalogMetadata, CursorQuery, MenuItem, Merchant, PublishStatus, TagDefinition } from '../types';

const emptyMetadata: CatalogMetadata = { areas: [], categories: [], tags: [] };
const pageSize = 10;
const publishOptions = [{ value: 'online', label: '已上架' }, { value: 'offline', label: '已下架' }];
const publishFilterOptions = [{ value: '', label: '全部状态' }, ...publishOptions];
const tagKindOptions = [
  { value: 'taste', label: '口味' },
  { value: 'diet', label: '饮食偏好' },
];
const tagKindLabels: Record<string, string> = Object.fromEntries(
  tagKindOptions.map((item) => [item.value, item.label]),
);

function useCatalogMetadata() {
  const [metadata, setMetadata] = useState<CatalogMetadata>(emptyMetadata);

  useEffect(() => {
    const controller = new AbortController();
    adminApi.catalogMetadata(controller.signal)
      .then((value) => { if (!controller.signal.aborted) setMetadata(value); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return metadata;
}

export function CatalogPage() {
  return (
    <div>
      <PageHeader title="商家与菜品" description="维护商家档案、营业状态以及可推荐的菜品和套餐" />
      <Card variant="borderless" className="catalog-card">
        <Tabs
          defaultActiveKey="merchants"
          items={[
            { key: 'merchants', label: '商家管理', children: <MerchantPanel /> },
            { key: 'items', label: '菜品 / 套餐管理', children: <MenuItemPanel /> },
            { key: 'tags', label: '标签字典', children: <TagPanel /> },
          ]}
        />
      </Card>
    </div>
  );
}

function MerchantPanel() {
  const { message, modal } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Merchant>();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<Merchant>();
  const latitude = Form.useWatch('latitude', form);
  const longitude = Form.useWatch('longitude', form);
  const metadata = useCatalogMetadata();
  const search = useDebouncedValue(keyword);

  const handleError = useCallback((error: unknown) => {
    message.error(error instanceof Error ? error.message : '商家列表加载失败');
  }, [message]);

  const loadPage = useCallback(
    (query: CursorQuery, signal: AbortSignal) => adminApi.merchants({
      ...query,
      search: search.trim() || undefined,
      active: status === '' ? undefined : status === 'online',
    }, signal),
    [search, status],
  );

  const list = useCursorList(loadPage, pageSize, handleError);

  const edit = (record?: Merchant) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(record ?? ({
      status: 'offline',
      openingHours: '10:00-20:00',
      latitude: CAMPUS_CENTER_WGS84.latitude,
      longitude: CAMPUS_CENTER_WGS84.longitude,
      priceLevel: 2,
    } as Merchant));
    setOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminApi.saveMerchant({ ...editing, ...values });
      message.success(editing ? '商家信息已更新' : '商家已创建');
      setOpen(false);
      if (editing) list.reload(); else list.reset();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (record: Merchant, next: PublishStatus) => {
    modal.confirm({
      title: `${next === 'online' ? '上架' : '下架'}商家“${record.name}”？`,
      content: next === 'offline'
        ? '下架后商家不会出现在搜索、推荐和地图结果中；档案、历史评价和审计记录仍会保留。'
        : '请确认营业信息和菜品数据已完成核验。',
      okText: `确认${next === 'online' ? '上架' : '下架'}`,
      okButtonProps: { danger: next === 'offline' },
      async onOk() {
        try {
          await adminApi.updateMerchantStatus(record.id, next);
          message.success(`商家已${next === 'online' ? '上架' : '下架'}`);
          list.reload();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '商家状态更新失败');
        }
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
      title: '操作', key: 'actions', fixed: 'right', width: 90,
      render: (_, record) => <Space size={2}>
        <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} onClick={() => edit(record)} /></Tooltip>
        {record.status === 'online'
          ? <Tooltip title="下架"><Button danger type="text" icon={<StopOutlined />} onClick={() => changeStatus(record, 'offline')} /></Tooltip>
          : <Tooltip title="上架"><Button type="text" icon={<UploadOutlined />} onClick={() => changeStatus(record, 'online')} /></Tooltip>}
      </Space>,
    },
  ];

  return (
    <>
      <div className="table-toolbar">
        <Space wrap>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索商家名称" value={keyword} onChange={(event) => setKeyword(event.target.value)} className="wide-search" />
          <Select value={status} onChange={setStatus} style={{ width: 132 }} options={publishFilterOptions} />
        </Space>
        <Space><Button icon={<ReloadOutlined />} onClick={list.reload}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>新增商家</Button></Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={list.items}
        loading={list.loading}
        scroll={{ x: 1090 }}
        pagination={false}
      />
      <CursorPagination list={list} />
      <Modal title={editing ? '编辑商家' : '新增商家'} width={680} open={open} onCancel={() => setOpen(false)} onOk={() => void save()} confirmLoading={saving} okText="保存">
        <Form form={form} layout="vertical" requiredMark={false} className="modal-form-grid">
          <Form.Item label="商家名称" name="name" rules={[{ required: true, message: '请输入商家名称' }]}><Input placeholder="如：林海餐厅·风味档口" /></Form.Item>
          <Form.Item label="所属区域" name="areaId" rules={[{ required: true, message: '请选择所属区域' }]}><Select showSearch optionFilterProp="label" placeholder="选择校园地点" options={metadata.areas.map((entry) => ({ value: entry.id, label: entry.name }))} /></Form.Item>
          <Form.Item label="餐饮类别" name="categoryId" rules={[{ required: true, message: '请选择餐饮类别' }]}><Select showSearch optionFilterProp="label" options={metadata.categories.map((entry) => ({ value: entry.id, label: entry.name }))} /></Form.Item>
          <Form.Item label="上架状态" name="status" rules={[{ required: true }]}><Select options={publishOptions} /></Form.Item>
          <Form.Item label="详细地址" name="address" rules={[{ required: true, message: '请输入详细地址' }]} className="form-span-2"><Input placeholder="用于地图定位和地点筛选" /></Form.Item>
          <Form.Item label="商家简介" name="description" className="form-span-2"><Input.TextArea rows={3} maxLength={500} showCount placeholder="介绍主营特色、服务信息等" /></Form.Item>
          <Form.Item
            label="地图选点（WGS-84）"
            className="form-span-2"
            extra="保存后由服务端换算用户端地图使用的 GCJ-02 坐标，用户端图钉会同步移动。"
          >
            <LocationPicker
              latitude={latitude}
              longitude={longitude}
              onChange={(location) => form.setFieldsValue(location)}
            />
          </Form.Item>
          <Form.Item label="纬度（WGS-84）" name="latitude" rules={[{ required: true, message: '请输入纬度' }]}><InputNumber min={-90} max={90} precision={6} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="经度（WGS-84）" name="longitude" rules={[{ required: true, message: '请输入经度' }]}><InputNumber min={-180} max={180} precision={6} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="营业时间" name="openingHours" rules={[{ required: true, message: '请输入营业时间' }]}><Input placeholder="06:30-21:00" /></Form.Item>
          <Form.Item label="价格等级" name="priceLevel"><Select options={[1, 2, 3, 4].map((value) => ({ value, label: `${'¥'.repeat(value)} · ${value} 级` }))} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function MenuItemPanel() {
  const { message, modal } = App.useApp();
  const [merchantId, setMerchantId] = useState<string>();
  const [merchantLabel, setMerchantLabel] = useState<string>();
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem>();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<MenuItem>();
  const metadata = useCatalogMetadata();

  const handleError = useCallback((error: unknown) => {
    message.error(error instanceof Error ? error.message : '菜品列表加载失败');
  }, [message]);

  const loadPage = useCallback(
    (query: CursorQuery, signal: AbortSignal) => adminApi.menuItems({
      ...query,
      merchantId,
      active: status === '' ? undefined : status === 'online',
    }, signal),
    [merchantId, status],
  );

  const list = useCursorList(loadPage, pageSize, handleError);

  const edit = (record?: MenuItem) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(record ?? { type: 'dish', status: 'offline', tags: [], imageUrl: '/images/dish-placeholder.webp' });
    setOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminApi.saveMenuItem({ ...editing, ...values });
      message.success(editing ? '菜品信息已更新' : '菜品已创建');
      setOpen(false);
      if (editing) list.reload(); else list.reset();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (record: MenuItem, next: PublishStatus) => {
    modal.confirm({
      title: `${next === 'online' ? '上架' : '下架'}“${record.name}”？`,
      content: next === 'offline'
        ? '下架后该菜品不会参与召回和推荐；档案、历史评价和审计记录仍会保留。'
        : '上架后将进入用户端的搜索与推荐候选池。',
      okText: `确认${next === 'online' ? '上架' : '下架'}`,
      okButtonProps: { danger: next === 'offline' },
      async onOk() {
        try {
          await adminApi.updateMenuItemStatus(record.id, next);
          message.success(`菜品已${next === 'online' ? '上架' : '下架'}`);
          list.reload();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '菜品状态更新失败');
        }
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
      title: '操作', key: 'actions', fixed: 'right', width: 90,
      render: (_, record) => <Space size={2}>
        <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} onClick={() => edit(record)} /></Tooltip>
        {record.status === 'online'
          ? <Tooltip title="下架"><Button danger type="text" icon={<StopOutlined />} onClick={() => changeStatus(record, 'offline')} /></Tooltip>
          : <Tooltip title="上架"><Button type="text" icon={<UploadOutlined />} onClick={() => changeStatus(record, 'online')} /></Tooltip>}
      </Space>,
    },
  ];

  return (
    <>
      <div className="table-toolbar">
        <Space wrap>
          <MerchantSelect
            allowClear
            value={merchantId}
            selectedLabel={merchantLabel}
            placeholder="按商家筛选"
            style={{ width: 240 }}
            onChange={(value, option) => { setMerchantId(value); setMerchantLabel(option?.label); }}
          />
          <Select value={status} onChange={setStatus} style={{ width: 132 }} options={publishFilterOptions} />
        </Space>
        <Space><Button icon={<ReloadOutlined />} onClick={list.reload}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>新增菜品 / 套餐</Button></Space>
      </div>
      <Table rowKey="id" columns={columns} dataSource={list.items} loading={list.loading} scroll={{ x: 1080 }} pagination={false} />
      <CursorPagination list={list} />
      <Modal title={editing ? '编辑菜品 / 套餐' : '新增菜品 / 套餐'} width={680} open={open} onCancel={() => setOpen(false)} onOk={() => void save()} confirmLoading={saving} okText="保存">
        <Form form={form} layout="vertical" requiredMark={false} className="modal-form-grid">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}><Input placeholder="菜品或套餐名称" /></Form.Item>
          <Form.Item label="所属商家" name="merchantId" rules={[{ required: true, message: '请选择商家' }]}>
            <MerchantSelect selectedLabel={editing?.merchantName} placeholder="输入商家名称检索" />
          </Form.Item>
          <Form.Item label="类型" name="type" rules={[{ required: true }]}><Select options={[{ value: 'dish', label: '菜品' }, { value: 'combo', label: '套餐' }]} /></Form.Item>
          <Form.Item label="分类" name="categoryId" rules={[{ required: true, message: '请选择分类' }]}><Select showSearch optionFilterProp="label" options={metadata.categories.map((entry) => ({ value: entry.id, label: entry.name }))} /></Form.Item>
          <Form.Item label="价格" name="price" rules={[{ required: true, message: '请输入价格' }]}><InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="上架状态" name="status"><Select options={publishOptions} /></Form.Item>
          <Form.Item label="简介" name="description" className="form-span-2"><Input.TextArea rows={3} maxLength={500} showCount placeholder="描述主要食材、分量或口味特点" /></Form.Item>
          <Form.Item label="菜品图片 URL" name="imageUrl" className="form-span-2"><Input placeholder="/images/dish-placeholder.webp" /></Form.Item>
          <Form.Item label="口味 / 特征标签" name="tags" className="form-span-2">
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="从服务端标签字典中选择"
              options={metadata.tags.map((entry) => ({
                value: entry.name,
                label: `${entry.name} · ${tagKindLabels[entry.kind] ?? entry.kind}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function TagPanel() {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<TagDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TagDefinition>();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<TagDefinition>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await adminApi.tags());
    } catch (error) {
      message.error(error instanceof Error ? error.message : '标签字典加载失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void load(); }, [load]);

  const edit = (record?: TagDefinition) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(record ?? ({ kind: 'taste' } as TagDefinition));
    setOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminApi.saveTag({ ...editing, ...values });
      message.success(editing ? '标签已更新' : '标签已创建');
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '标签保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = (record: TagDefinition) => {
    modal.confirm({
      title: `删除标签“${record.name}”？`,
      content: '删除后不能再为菜品选择该标签；已被使用的标签需要先从相关菜品移除。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      async onOk() {
        try {
          await adminApi.deleteTag(record.id);
          message.success('标签已删除');
          await load();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '标签删除失败');
        }
      },
    });
  };

  const filtered = items.filter((item) =>
    (!kind || item.kind === kind)
    && (!keyword.trim() || item.name.toLowerCase().includes(keyword.trim().toLowerCase())),
  );
  const columns: ColumnsType<TagDefinition> = [
    {
      title: '标签',
      key: 'tag',
      render: (_, record) => (
        <div className="table-primary"><strong>{record.name}</strong><span>{record.id}</span></div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 150,
      render: (value: string) => (
        <Tag color={value === 'taste' ? 'blue' : value === 'diet' ? 'green' : 'default'}>
          {tagKindLabels[value] ?? value}
        </Tag>
      ),
    },
    {
      title: '使用情况',
      dataIndex: 'usageCount',
      width: 140,
      render: (value?: number) => typeof value === 'number'
        ? value ? `${value} 个菜品` : '暂未使用'
        : '由服务端校验',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} onClick={() => edit(record)} /></Tooltip>
          <Tooltip title={record.usageCount ? '请先从菜品中移除该标签' : '删除'}>
            <Button
              danger
              type="text"
              disabled={(record.usageCount ?? 0) > 0}
              icon={<DeleteOutlined />}
              onClick={() => remove(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="tag-kind-summary">
        {tagKindOptions.map((option) => (
          <Tag key={option.value} color={option.value === 'taste' ? 'blue' : 'green'}>
            {option.label} {items.filter((item) => item.kind === option.value).length}
          </Tag>
        ))}
      </div>
      <div className="table-toolbar">
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索标签名称"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="wide-search"
          />
          <Select
            value={kind}
            onChange={setKind}
            style={{ width: 140 }}
            options={[{ value: '', label: '全部类型' }, ...tagKindOptions]}
          />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          <Button type="primary" icon={<TagsOutlined />} onClick={() => edit()}>新增标签</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        pagination={false}
        scroll={{ x: 720 }}
      />
      <Typography.Paragraph type="secondary" className="table-note">
        标签字典由服务端一次性返回全量数据，此处的搜索与类型筛选作用于完整字典。
      </Typography.Paragraph>
      <Modal
        title={editing ? '编辑标签' : '新增标签'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            label="标签名称"
            name="name"
            rules={[
              { required: true, whitespace: true, message: '请输入标签名称' },
              { max: 60, message: '标签名称不能超过 60 个字符' },
            ]}
          >
            <Input placeholder="如：微辣、高蛋白" />
          </Form.Item>
          <Form.Item label="标签类型" name="kind" rules={[{ required: true, message: '请选择标签类型' }]}>
            <Select options={tagKindOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
