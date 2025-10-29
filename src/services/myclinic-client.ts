import axios, { AxiosInstance } from 'axios';
import { AgendaItem } from '../types/agenda';
import { AniversarianteItem } from '../types/relatorios';

// Myclinic schedule types
interface MyclinicSchedule {
  id: number;
  note: string;
  user_id: number;
  customer_id: number;
  salon_id: number;
  origin: string;
  start: string;
  end: string;
  title: string;
  statusLabel: string;
  allDay: boolean;
  className: string;
  resourceId: number;
  edit_link: string;
  editable: boolean;
  status: string;
  subtitle: string;
  description: string;
  customColor: string | null;
}

interface MyclinicSchedulesResponse {
  schedules: MyclinicSchedule[];
  blocks: any[];
}

interface MyclinicEventDetail {
  id: number;
  description: string;
}

interface MyclinicBirthdayCustomer {
  nome: string;
  telefone: string;
  dataNascimento: string;
}

export class MyclinicClient {
  private client: AxiosInstance;
  private sessionCookie: string | null = null;
  private authenticityToken: string | null = null;
  private storedEmail: string | null = null;
  private storedPassword: string | null = null;
  private subdomain: string;
  private salonId: string;

  constructor(
    subdomain: string = 'myclinic',
    private baseURL: string = 'https://myclinic.bemp.app',
    salonId: string = '436'
  ) {
    this.subdomain = subdomain;
    this.salonId = salonId;
    this.client = axios.create({
      baseURL,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 0, // Handle redirects manually
      validateStatus: (status) => status >= 200 && status < 400, // Accept 3xx responses
    });
  }

  /**
   * Extrai o authenticity_token do HTML do formulário de login
   */
  private extractAuthenticityToken(html: string): string | null {
    try {
      // Busca por: <meta name="csrf-token" content="..." />
      const metaMatch = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"\s*\/>/);
      if (metaMatch) {
        return metaMatch[1];
      }

      // Fallback: busca por input hidden com name="authenticity_token"
      const inputMatch = html.match(/<input[^>]*name="authenticity_token"[^>]*value="([^"]+)"[^>]*>/);
      if (inputMatch) {
        return inputMatch[1];
      }

      return null;
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return null;
    }
  }

  /**
   * Atualiza o CSRF token fazendo um GET na home
   */
  private async refreshCsrfToken(): Promise<void> {
    try {
      const response = await this.client.get('/', {
        headers: {
          'Cookie': `bemp-session=${this.sessionCookie}`,
        }
      });

      this.authenticityToken = this.extractAuthenticityToken(response.data);
    } catch (error) {
      console.error('Error refreshing CSRF token:', error);
    }
  }

  /**
   * Extrai o cookie de sessão dos headers
   */
  private extractSessionCookie(setCookieHeader: string | string[]): string | null {
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];

    for (const cookie of cookies) {
      if (cookie.startsWith('bemp-session=')) {
        const match = cookie.match(/bemp-session=([^;]+)/);
        return match ? match[1] : null;
      }
    }

    return null;
  }

  /**
   * Faz login no sistema myclinic
   */
  async login(email: string, password: string): Promise<boolean> {
    try {
      // Step 1: GET do formulário de login para obter o CSRF token
      const loginPageResponse = await this.client.get('/users/sign_in');

      // Extrair cookie de sessão inicial
      const setCookie = loginPageResponse.headers['set-cookie'];
      if (setCookie) {
        this.sessionCookie = this.extractSessionCookie(setCookie);
      }

      // Extrair authenticity_token do HTML
      this.authenticityToken = this.extractAuthenticityToken(loginPageResponse.data);

      if (!this.authenticityToken) {
        throw new Error('Failed to extract authenticity token');
      }

      // Step 2: POST do login
      const formData = new URLSearchParams({
        'authenticity_token': this.authenticityToken,
        'user[organization][subdomain]': this.subdomain,
        'user[username]': email,
        'user[password]': password,
        'button': ''
      });

      const loginResponse = await this.client.post('/users/sign_in', formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': `bemp-session=${this.sessionCookie}`,
          'Origin': this.baseURL,
          'Referer': `${this.baseURL}/users/sign_in`,
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-User': '?1',
          'Sec-Fetch-Dest': 'document',
          'Upgrade-Insecure-Requests': '1',
        }
      });

      // Step 3: Extrair novo cookie de sessão após login bem-sucedido
      const loginSetCookie = loginResponse.headers['set-cookie'];
      if (loginSetCookie) {
        const newSessionCookie = this.extractSessionCookie(loginSetCookie);
        if (newSessionCookie) {
          this.sessionCookie = newSessionCookie;
          this.storedEmail = email;
          this.storedPassword = password;
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }

  /**
   * Verifica se há uma sessão válida
   */
  isAuthenticated(): boolean {
    return this.sessionCookie !== null;
  }

  /**
   * Retorna o cookie de sessão atual
   */
  getSessionCookie(): string | null {
    return this.sessionCookie;
  }

  /**
   * Faz requisições autenticadas
   */
  async makeRequest<T>(method: 'GET' | 'POST', endpoint: string, data?: any, params?: any): Promise<T> {
    if (!this.isAuthenticated()) {
      if (this.storedEmail && this.storedPassword) {
        const loginSuccess = await this.login(this.storedEmail, this.storedPassword);
        if (!loginSuccess) {
          throw new Error('Auto-login failed. Please login manually.');
        }
      } else {
        throw new Error('Not authenticated. Please login first.');
      }
    }

    try {
      const response = await this.client.request<T>({
        method,
        url: endpoint,
        data,
        params,
        headers: {
          'Cookie': `bemp-session=${this.sessionCookie}`,
        }
      });

      return response.data;
    } catch (error) {
      // Se receber 401/403, tentar login novamente
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        if (this.storedEmail && this.storedPassword) {
          const loginSuccess = await this.login(this.storedEmail, this.storedPassword);
          if (loginSuccess) {
            // Tentar a requisição novamente
            const retryResponse = await this.client.request<T>({
              method,
              url: endpoint,
              data,
              params,
              headers: {
                'Cookie': `bemp-session=${this.sessionCookie}`,
              }
            });
            return retryResponse.data;
          }
        }
      }
      throw error;
    }
  }

  /**
   * Extrai o nome do paciente do título HTML
   */
  private extractCustomerName(htmlTitle: string): string {
    // Remove tags HTML e ícones
    const nameMatch = htmlTitle.match(/<span[^>]*>([^<]+)<\/span>/);
    return nameMatch ? nameMatch[1].trim() : htmlTitle.replace(/<[^>]+>/g, '').trim();
  }

  /**
   * Extrai o telefone da descrição HTML
   */
  private extractPhoneFromDescription(htmlDescription: string): { telefone: string; celular: string } {
    // Busca por padrão de telefone: +55 (XX) XXXXX-XXXX ou similar
    const phoneMatch = htmlDescription.match(/\+?\d{0,2}\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/);
    let phone = phoneMatch ? phoneMatch[0] : '';

    // Remove todos os caracteres que não são números
    phone = phone.replace(/\D/g, '');

    return {
      telefone: phone,
      celular: phone
    };
  }

  /**
   * Busca detalhes de um evento específico
   */
  async getEventDetail(scheduleId: number): Promise<MyclinicEventDetail | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    if (!this.authenticityToken) {
      await this.refreshCsrfToken();
    }

    try {
      const timestamp = Date.now();
      const response = await this.client.get<MyclinicEventDetail>(`/schedules/${scheduleId}/event_detail`, {
        params: {
          _: timestamp
        },
        headers: {
          'Cookie': `bemp-session=${this.sessionCookie}`,
          'X-Csrf-Token': this.authenticityToken || '',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
        }
      });

      return response.data;
    } catch (error) {
      console.error(`Error fetching event detail for schedule ${scheduleId}:`, error);
      return null;
    }
  }

  /**
   * Busca agendamentos
   */
  async getAgenda(startDate: string, endDate: string, semFalta = false, statusFilter?: string | string[]): Promise<AgendaItem[]> {
    if (!this.isAuthenticated()) {
      if (this.storedEmail && this.storedPassword) {
        const loginSuccess = await this.login(this.storedEmail, this.storedPassword);
        if (!loginSuccess) {
          throw new Error('Not authenticated. Please login first.');
        }
      } else {
        throw new Error('Not authenticated. Please login first.');
      }
    }

    // Atualizar CSRF token antes de fazer a requisição
    if (!this.authenticityToken) {
      await this.refreshCsrfToken();
    }

    try {
      // Myclinic usa apenas a data inicial no formato YYYY-MM-DD
      // Se precisar buscar um range, fazer múltiplas requisições
      const response = await this.client.get<MyclinicSchedulesResponse>('/schedules/entries', {
        params: {
          date: startDate
        },
        headers: {
          'Cookie': `bemp-session=${this.sessionCookie}`,
          'X-Csrf-Token': this.authenticityToken || '',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
        }
      });

      // Mapear schedules do myclinic para o formato AgendaItem
      const agendaItemsPromises = response.data.schedules.map(async (schedule) => {
        // A data vem no formato: "2025-10-24T11:00:00.000-03:00"
        // Vamos extrair diretamente a data e hora sem conversão de timezone
        const startStr = schedule.start; // "2025-10-24T11:00:00.000-03:00"
        const endStr = schedule.end;     // "2025-10-24T12:00:00.000-03:00"

        // Extrair data (YYYY-MM-DD)
        const dataFormatada = startStr.split('T')[0]; // "2025-10-24"

        // Extrair hora de início (HH:mm)
        const horaInicio = startStr.split('T')[1].substring(0, 5); // "11:00"

        // Extrair hora de fim (HH:mm)
        const horaFim = endStr.split('T')[1].substring(0, 5); // "12:00"

        // Buscar detalhes do evento para obter telefone
        const eventDetail = await this.getEventDetail(schedule.id);
        let telefone = '';
        let celular = '';

        if (eventDetail && eventDetail.description) {
          const phones = this.extractPhoneFromDescription(eventDetail.description);
          telefone = phones.telefone;
          celular = phones.celular;
        }

        return {
          id: schedule.id,
          data: dataFormatada,
          dataHora: startStr,
          horaInicio,
          horaFim,
          nomePessoa: this.extractCustomerName(schedule.title),
          telefone,
          celular,
          servicos: schedule.note ? [schedule.note] : [],
          status: schedule.status
        };
      });

      let agendaItems = await Promise.all(agendaItemsPromises);

      // Aplicar filtro de status se fornecido
      if (statusFilter) {
        const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
        agendaItems = agendaItems.filter(item =>
          statusArray.some(status =>
            item.status.toLowerCase().includes(status.toLowerCase())
          )
        );
      }

      // Aplicar filtro semFalta (remover agendamentos com falta)
      if (semFalta) {
        agendaItems = agendaItems.filter(item =>
          !item.status.toLowerCase().includes('falta') &&
          !item.status.toLowerCase().includes('ausente')
        );
      }

      return agendaItems;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Tentar fazer login novamente
        if (this.storedEmail && this.storedPassword) {
          const loginSuccess = await this.login(this.storedEmail, this.storedPassword);
          if (loginSuccess) {
            // Recursão para tentar novamente
            return this.getAgenda(startDate, endDate, semFalta, statusFilter);
          }
        }
      }
      throw error;
    }
  }

  /**
   * Parseia o HTML da tabela de aniversariantes
   */
  private parseBirthdayTable(html: string): MyclinicBirthdayCustomer[] {
    const customers: MyclinicBirthdayCustomer[] = [];

    // Regex para encontrar as linhas da tabela <tr>...</tr>
    const rowRegex = /<tr><td[^>]*>.*?<\/td><td[^>]*>.*?<\/td><td[^>]*>.*?<\/td><\/tr>/g;
    const rows = html.match(rowRegex) || [];

    for (const row of rows) {
      // Extrair nome (texto dentro do <a>)
      const nameMatch = row.match(/<a[^>]*>([^<]+)<\/a>/);
      const nome = nameMatch ? nameMatch[1].trim() : '';

      // Extrair telefone (texto antes do <a> do whatsapp)
      const phoneMatch = row.match(/<td[^>]*>([+\d\s()-]+)<a[^>]*fab fa-whatsapp/);
      let telefone = phoneMatch ? phoneMatch[1].trim() : '';

      // Remover caracteres não numéricos do telefone
      telefone = telefone.replace(/\D/g, '');

      // Extrair data de nascimento (formato DD/MM/YYYY)
      const dateMatch = row.match(/<td[^>]*class="date[^"]*">(\d{2}\/\d{2}\/\d{4})<\/td>/);
      const dataNascimento = dateMatch ? dateMatch[1] : '';

      if (nome && dataNascimento) {
        customers.push({
          nome,
          telefone,
          dataNascimento
        });
      }
    }

    return customers;
  }

  /**
   * Busca aniversariantes
   */
  async getAniversariantes(startDate: string, endDate: string, situacaoId: string = ''): Promise<AniversarianteItem[]> {
    if (!this.isAuthenticated()) {
      if (this.storedEmail && this.storedPassword) {
        const loginSuccess = await this.login(this.storedEmail, this.storedPassword);
        if (!loginSuccess) {
          throw new Error('Not authenticated. Please login first.');
        }
      } else {
        throw new Error('Not authenticated. Please login first.');
      }
    }

    // Atualizar CSRF token antes de fazer a requisição
    if (!this.authenticityToken) {
      await this.refreshCsrfToken();
    }

    try {
      // Primeiro, fazer um GET na página do relatório para extrair o CSRF token correto
      try {
        const pageResponse = await this.client.get('/report/customers_birthdays', {
          headers: {
            'Cookie': `bemp-session=${this.sessionCookie}`,
          }
        });

        // Extrair CSRF token da página do relatório
        const csrfToken = this.extractAuthenticityToken(pageResponse.data);
        if (csrfToken) {
          this.authenticityToken = csrfToken;
        }
      } catch (error) {
        console.error('Erro ao carregar página do relatório:', error);
      }

      // Montar o body do form
      const formData = new URLSearchParams({
        'authenticity_token': this.authenticityToken || '',
        'report_customers_birthdays_report[start_date]': startDate,
        'report_customers_birthdays_report[end_date]': endDate,
        'report_customers_birthdays_report[merge_salon_ids][]': this.salonId,
        'button': ''
      });

      const response = await this.client.post('/report/customers_birthdays', formData.toString(), {
        headers: {
          'Cookie': `bemp-session=${this.sessionCookie}`,
          'X-Csrf-Token': this.authenticityToken || '',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml',
          'Turbo-Frame': 'report',
          'X-Turbo-Request-Id': this.generateRequestId(),
          'Origin': this.baseURL,
          'Referer': `${this.baseURL}/report/customers_birthdays`,
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
        }
      });

      // Parsear o HTML retornado
      const customers = this.parseBirthdayTable(response.data);

      // Mapear para o formato AniversarianteItem
      return customers.map(customer => ({
        pessoaId: 0, // Não disponível no HTML
        data: customer.dataNascimento,
        nomeCliente: customer.nome,
        sexo: '', // Não disponível no HTML
        telefone: customer.telefone,
        celular: customer.telefone,
        email: '', // Não disponível no HTML
        nomeSituacao: 'Ativo' // Assumindo que todos são ativos
      }));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Tentar fazer login novamente
        if (this.storedEmail && this.storedPassword) {
          const loginSuccess = await this.login(this.storedEmail, this.storedPassword);
          if (loginSuccess) {
            // Recursão para tentar novamente
            return this.getAniversariantes(startDate, endDate, situacaoId);
          }
        }
      }
      throw error;
    }
  }

  /**
   * Gera um ID de requisição único para o Turbo
   */
  private generateRequestId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
