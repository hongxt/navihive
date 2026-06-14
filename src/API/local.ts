import type { ExportData, Group, ImportResult, LoginResponse, Site } from './http';

interface LocalData {
  groups: Group[];
  sites: Site[];
  configs: Record<string, string>;
}

const STORAGE_KEY = 'navihive.localData';
const AUTH_TOKEN_KEY = 'auth_token';

const DEFAULT_LOCAL_DATA: LocalData = {
  groups: [],
  sites: [],
  configs: {},
};

function cloneData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

function getStorageItem(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(key);
}

function setStorageItem(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value);
}

function removeStorageItem(key: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(key);
}

export class LocalNavigationClient {
  private token: string | null = getStorageItem(AUTH_TOKEN_KEY);

  isLoggedIn(): boolean {
    return !!this.token;
  }

  setToken(token: string): void {
    this.token = token;
    setStorageItem(AUTH_TOKEN_KEY, token);
  }

  clearToken(): void {
    this.token = null;
    removeStorageItem(AUTH_TOKEN_KEY);
  }

  logout(): void {
    this.clearToken();
  }

  async login(
    username: string,
    password: string,
    rememberMe: boolean = false
  ): Promise<LoginResponse> {
    const token = btoa(`${username}:${Date.now()}:${rememberMe}`);
    this.setToken(token);

    return {
      success: true,
      token,
      message: '本地模式登录成功',
    };
  }

  async checkAuthStatus(): Promise<boolean> {
    return true;
  }

  async getGroups(): Promise<Group[]> {
    return cloneData(this.readData().groups).sort((a, b) => a.order_num - b.order_num);
  }

  async getGroup(id: number): Promise<Group | null> {
    return cloneData(this.readData().groups.find((group) => group.id === id) || null);
  }

  async createGroup(group: Group): Promise<Group> {
    const data = this.readData();
    const now = new Date().toISOString();
    const newGroup: Group = {
      ...group,
      id: this.getNextId(data.groups),
      created_at: now,
      updated_at: now,
    };

    data.groups.push(newGroup);
    this.writeData(data);
    return cloneData(newGroup);
  }

  async updateGroup(id: number, group: Partial<Group>): Promise<Group | null> {
    const data = this.readData();
    const index = data.groups.findIndex((item) => item.id === id);
    if (index === -1) return null;

    data.groups[index] = {
      ...data.groups[index],
      ...group,
      id,
      updated_at: new Date().toISOString(),
    };

    this.writeData(data);
    return cloneData(data.groups[index]);
  }

  async deleteGroup(id: number): Promise<boolean> {
    const data = this.readData();
    const originalLength = data.groups.length;
    data.groups = data.groups.filter((group) => group.id !== id);
    data.sites = data.sites.filter((site) => site.group_id !== id);
    this.writeData(data);
    return data.groups.length !== originalLength;
  }

  async getSites(groupId?: number): Promise<Site[]> {
    const sites = this.readData().sites.filter((site) =>
      groupId === undefined ? true : site.group_id === groupId
    );
    return cloneData(sites.sort((a, b) => a.order_num - b.order_num));
  }

  async getSite(id: number): Promise<Site | null> {
    return cloneData(this.readData().sites.find((site) => site.id === id) || null);
  }

  async createSite(site: Site): Promise<Site> {
    const data = this.readData();
    const now = new Date().toISOString();
    const newSite: Site = {
      ...site,
      id: this.getNextId(data.sites),
      icon: site.icon || '',
      description: site.description || '',
      notes: site.notes || '',
      created_at: now,
      updated_at: now,
    };

    data.sites.push(newSite);
    this.writeData(data);
    return cloneData(newSite);
  }

  async updateSite(id: number, site: Partial<Site>): Promise<Site | null> {
    const data = this.readData();
    const index = data.sites.findIndex((item) => item.id === id);
    if (index === -1) return null;

    data.sites[index] = {
      ...data.sites[index],
      ...site,
      id,
      updated_at: new Date().toISOString(),
    };

    this.writeData(data);
    return cloneData(data.sites[index]);
  }

  async deleteSite(id: number): Promise<boolean> {
    const data = this.readData();
    const originalLength = data.sites.length;
    data.sites = data.sites.filter((site) => site.id !== id);
    this.writeData(data);
    return data.sites.length !== originalLength;
  }

  async updateGroupOrder(groupOrders: { id: number; order_num: number }[]): Promise<boolean> {
    const data = this.readData();
    const orderMap = new Map(groupOrders.map((item) => [item.id, item.order_num]));
    data.groups = data.groups.map((group) => ({
      ...group,
      order_num: orderMap.get(group.id || 0) ?? group.order_num,
      updated_at: orderMap.has(group.id || 0) ? new Date().toISOString() : group.updated_at,
    }));
    this.writeData(data);
    return true;
  }

  async updateSiteOrder(siteOrders: { id: number; order_num: number }[]): Promise<boolean> {
    const data = this.readData();
    const orderMap = new Map(siteOrders.map((item) => [item.id, item.order_num]));
    data.sites = data.sites.map((site) => ({
      ...site,
      order_num: orderMap.get(site.id || 0) ?? site.order_num,
      updated_at: orderMap.has(site.id || 0) ? new Date().toISOString() : site.updated_at,
    }));
    this.writeData(data);
    return true;
  }

  async getConfigs(): Promise<Record<string, string>> {
    return cloneData(this.readData().configs);
  }

  async getConfig(key: string): Promise<string | null> {
    return this.readData().configs[key] || null;
  }

  async setConfig(key: string, value: string): Promise<boolean> {
    const data = this.readData();
    data.configs[key] = value;
    this.writeData(data);
    return true;
  }

  async deleteConfig(key: string): Promise<boolean> {
    const data = this.readData();
    const exists = key in data.configs;
    delete data.configs[key];
    this.writeData(data);
    return exists;
  }

  async exportData(): Promise<ExportData> {
    const data = this.readData();
    return {
      groups: cloneData(data.groups),
      sites: cloneData(data.sites),
      configs: cloneData(data.configs),
      version: '1.0-local',
      exportDate: new Date().toISOString(),
    };
  }

  async importData(data: ExportData): Promise<ImportResult> {
    this.writeData({
      groups: cloneData(data.groups || []),
      sites: cloneData(data.sites || []),
      configs: cloneData(data.configs || {}),
    });

    return {
      success: true,
      stats: {
        groups: {
          total: data.groups?.length || 0,
          created: data.groups?.length || 0,
          merged: 0,
        },
        sites: {
          total: data.sites?.length || 0,
          created: data.sites?.length || 0,
          updated: 0,
          skipped: 0,
        },
      },
    };
  }

  private readData(): LocalData {
    const rawData = getStorageItem(STORAGE_KEY);
    if (!rawData) return cloneData(DEFAULT_LOCAL_DATA);

    try {
      const parsedData = JSON.parse(rawData) as Partial<LocalData>;
      return {
        groups: Array.isArray(parsedData.groups) ? parsedData.groups : [],
        sites: Array.isArray(parsedData.sites) ? parsedData.sites : [],
        configs:
          parsedData.configs && typeof parsedData.configs === 'object' ? parsedData.configs : {},
      };
    } catch {
      return cloneData(DEFAULT_LOCAL_DATA);
    }
  }

  private writeData(data: LocalData): void {
    setStorageItem(STORAGE_KEY, JSON.stringify(data));
  }

  private getNextId(items: Array<{ id?: number }>): number {
    return Math.max(0, ...items.map((item) => item.id || 0)) + 1;
  }
}
