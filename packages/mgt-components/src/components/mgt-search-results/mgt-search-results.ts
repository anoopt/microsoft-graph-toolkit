/**
 * -------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation.  All Rights Reserved.  Licensed under the MIT License.
 * See License in the project root for license information.
 * -------------------------------------------------------------------------------------------
 */

import { html, HTMLTemplateResult, nothing, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import {
  CacheItem,
  CacheService,
  CacheStore,
  equals,
  MgtTemplatedComponent,
  prepScopes,
  Providers,
  ProviderState,
  customElement,
  mgtHtml,
  BetaGraph,
  BatchResponse
} from '@microsoft/mgt-element';

import { schemas } from '../../graph/cacheStores';
import { strings } from './strings';
import { styles } from './mgt-search-results-css';
import { EntityType, SearchHit, SearchHitsContainer, SearchRequest } from '@microsoft/microsoft-graph-types';
import { SearchRequest as BetaSearchRequest } from '@microsoft/microsoft-graph-types-beta';
import { getNameFromUrl, getRelativeDisplayDate, sanitizeSummary, trimFileExtension } from '../../utils/Utils';
import { getSvg, SvgIcon } from '../../utils/SvgHelper';
import { fluentSkeleton, fluentButton, fluentTooltip, fluentDivider } from '@fluentui/web-components';
import { registerFluentComponents } from '../../utils/FluentComponents';

registerFluentComponents(fluentSkeleton, fluentButton, fluentTooltip, fluentDivider);

/**
 * Object to be stored in cache representing a generic query
 */
interface CacheResponse extends CacheItem {
  /**
   * json representing a response as string
   */
  response?: string;
}

/**
 * Object representing a thumbnail
 */
interface Thumbnail {
  /**
   * The url of the Thumbnail
   */
  url?: string;
}

/**
 * Defines the expiration time
 */
const getResponseInvalidationTime = (currentInvalidationPeriod: number): number =>
  currentInvalidationPeriod ||
  CacheService.config.response.invalidationPeriod ||
  CacheService.config.defaultInvalidationPeriod;

/**
 * Whether the response store is enabled
 */
const getIsResponseCacheEnabled = (): boolean =>
  CacheService.config.response.isEnabled && CacheService.config.isEnabled;

/**
 * Custom element for making Microsoft Graph get queries
 *
 * @fires {CustomEvent<DataChangedDetail>} dataChange - Fired when data changes
 * *
 * @cssprop --bookmark-border-radius - {Length} Border radius of a bookmark
 * @cssprop --bookmark-box-shadow - {Length} Box shadow of a bookmark
 * @cssprop --bookmark-border - {Length} Border of a bookkmark
 * @cssprop --bookmark-padding - {Length} Padding of a bookkmark
 *
 * @class mgt-search-results
 * @extends {MgtTemplatedComponent}
 */
@customElement('search-results')
export class MgtSearchResults extends MgtTemplatedComponent {
  /**
   * Default page size is 10
   */
  private _size: number = 10;

  /**
   * Array of styles to apply to the element. The styles should be defined
   * user the `css` tag function.
   */
  static get styles() {
    return styles;
  }

  protected get strings() {
    return strings;
  }

  private _queryString: string;
  private _entityTypes: string[] = ['driveItem', 'listItem', 'site'];

  /**
   * The query to send to Microsoft Search
   *
   * @type {string}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'query-string',
    reflect: true,
    type: String
  })
  public get queryString(): string {
    return this._queryString;
  }
  public set queryString(value: string) {
    if (this._queryString !== value) {
      this._queryString = value;
      this._currentPage = 1;
      this.setLoadingState(true);
      this.requestStateUpdate(true);
    }
  }

  /**
   * Query template to use in complex search scenarios
   * Query Templates are currently supported only on the beta endpoint
   */
  @property({
    attribute: 'query-template',
    type: String
  })
  public queryTemplate: string;

  /**
   * One or more types of resources expected in the response.
   * Possible values are: list, site, listItem, message, event,
   * drive, driveItem, externalItem.
   *
   * @type {string[]}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'entity-types',
    converter: value => {
      return value.split(',').map(v => v.trim());
    },
    type: String
  })
  public get entityTypes(): string[] {
    return this._entityTypes;
  }
  public set entityTypes(value) {
    this._entityTypes = value;
  }

  /**
   * The scopes to request
   *
   * @type {string[]}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'scopes',
    converter: (value, type) => {
      return value ? value.toLowerCase().split(',') : null;
    },
    reflect: true
  })
  public scopes: string[] = [];

  /**
   * Content sources to use with External Items
   *
   * @type {string[]}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'content-sources',
    converter: (value, type) => {
      return value ? value.toLowerCase().split(',') : null;
    },
    reflect: true
  })
  public contentSources: string[] = [];

  /**
   * Api version to use for request
   *
   * @type {string}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'version',
    reflect: true,
    type: String
  })
  public version: string = 'v1.0';

  /**
   * Specifies the offset for the search results.
   * Offset 0 returns the very first result.
   *
   * @type {number}
   * @memberof MgtSearchResults
   */
  public get from(): number {
    return (this.currentPage - 1) * this.size;
  }

  /**
   * The size of the page to be retrieved.
   * The maximum value is 1000.
   *
   * @type {number}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'size',
    reflect: true,
    type: Number
  })
  public get size(): number {
    return this._size;
  }
  public set size(value) {
    if (value > this.MAX_PAGE_SIZE) {
      this._size = this.MAX_PAGE_SIZE;
    } else {
      this._size = value;
    }
  }

  /**
   * The maximum number of pages to be clickable
   * in the paging control
   *
   * @type {number}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'paging-max',
    reflect: true,
    type: Number
  })
  public pagingMax: number = 7;

  /**
   * Sets whether the result thumbnail should be fetched
   * from the Microsoft Graph
   *
   * @type {boolean}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'fetch-thumbnail',
    type: Boolean
  })
  public fetchThumbnail: boolean;

  /**
   * Contains the fields to be returned for each resource
   *
   * @type {string[]}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'fields',
    converter: value => {
      return value.split(',').map(v => v.trim());
    },
    type: String
  })
  public fields: string[];

  /**
   * This triggers hybrid sort for messages : the first 3 messages are the most relevant.
   * This property is only applicable to entityType=message
   *
   * @type {boolean}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'enable-top-results',
    reflect: true,
    type: Boolean
  })
  public enableTopResults: boolean = false;

  /**
   * Enables cache on the response from the specified resource
   * default = false
   *
   * @type {boolean}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'cache-enabled',
    reflect: true,
    type: Boolean
  })
  public cacheEnabled: boolean = false;

  /**
   * Invalidation period of the cache for the responses in milliseconds
   *
   * @type {number}
   * @memberof MgtSearchResults
   */
  @property({
    attribute: 'cache-invalidation-period',
    reflect: true,
    type: Number
  })
  public cacheInvalidationPeriod: number = 30000;

  /**
   * Gets or sets the response of the request
   *
   * @type any
   * @memberof MgtSearchResults
   */
  @property({ attribute: false }) public response: any;

  private isRefreshing: boolean = false;
  private readonly SEARCH_ENDPOINT: string = '/search/query';
  private readonly MAX_PAGE_SIZE: number = 1000;
  private readonly DEFAULT_FIELDS: string[] = [
    'webUrl',
    'lastModifiedBy',
    'lastModifiedDateTime',
    'summary',
    'displayName',
    'name'
  ];
  private _currentPage: number = 1;
  @state()
  public get currentPage(): number {
    return this._currentPage;
  }
  public set currentPage(value: number) {
    if (this._currentPage !== value) {
      this._currentPage = value;
      this.requestStateUpdate(true);
    }
  }

  /**
   * Synchronizes property values when attributes change.
   *
   * @param {*} name
   * @param {*} oldval
   * @param {*} newval
   * @memberof MgtSearchResults
   */
  public attributeChangedCallback(name, oldval, newval) {
    super.attributeChangedCallback(name, oldval, newval);
    this.requestStateUpdate();
  }

  /**
   * Refresh the data
   *
   * @param {boolean} [hardRefresh=false]
   * if false (default), the component will only update if the data changed
   * if true, the data will be first cleared and reloaded completely
   * @memberof MgtSearchResults
   */
  public refresh(hardRefresh = false) {
    this.isRefreshing = true;
    if (hardRefresh) {
      this.clearState();
    }
    this.requestStateUpdate(hardRefresh);
  }

  /**
   * Clears state of the component
   *
   * @protected
   * @memberof MgtSearchResults
   */
  protected clearState(): void {
    this.response = null;
  }

  /**
   * Invoked on each update to perform rendering tasks. This method must return
   * a lit-html TemplateResult. Setting properties inside this method will *not*
   * trigger the element to update.
   */
  protected render(): TemplateResult {
    let renderedTemplate = null;
    let headerTemplate = null;
    let footerTemplate = null;

    // tslint:disable-next-line: no-string-literal
    if (this.hasTemplate('header')) {
      headerTemplate = this.renderTemplate('header', this.response);
    }

    footerTemplate = this.renderFooter(this.response?.value[0]?.hitsContainers[0]);

    if (this.isLoadingState) {
      renderedTemplate = this.renderLoading();
    } else if (this.error) {
      renderedTemplate = this.renderError();
      // tslint:disable-next-line: no-string-literal
    } else if (this.response && this.response?.value[0]?.hitsContainers[0]) {
      renderedTemplate = html`${this.response?.value[0]?.hitsContainers[0]?.hits?.map(result =>
        this.renderResult(result)
      )}`;
    } else if (this.response) {
      renderedTemplate = this.renderTemplate('default', this.response) || html``;
    } else if (this.hasTemplate('no-data')) {
      renderedTemplate = this.renderTemplate('no-data', null);
    } else {
      renderedTemplate = html``;
    }

    return html`
      ${headerTemplate}
      <div class="search-results">
        ${renderedTemplate}
      </div>
      ${footerTemplate}`;
  }

  /**
   * load state into the component.
   *
   * @protected
   * @returns
   * @memberof MgtSearchResults
   */
  protected async loadState() {
    const provider = Providers.globalProvider;

    this.error = null;

    if (!provider || provider.state !== ProviderState.SignedIn) {
      return;
    }

    if (this.queryString) {
      try {
        const requestOptions: any = this.getRequestOptions();

        let cache: CacheStore<CacheResponse>;
        const key = JSON.stringify({
          endpoint: `${this.version}${this.SEARCH_ENDPOINT}`,
          requestOptions: requestOptions
        });
        let response = null;

        if (this.shouldRetrieveCache()) {
          cache = CacheService.getCache<CacheResponse>(schemas.search, schemas.search.stores.responses);
          const result: CacheResponse = getIsResponseCacheEnabled() ? await cache.getValue(key) : null;
          if (result && getResponseInvalidationTime(this.cacheInvalidationPeriod) > Date.now() - result.timeCached) {
            response = JSON.parse(result.response);
          }
        }

        if (!response) {
          const graph = provider.graph.forComponent(this);
          let request = graph.api(this.SEARCH_ENDPOINT).version(this.version);

          if (this.scopes && this.scopes.length) {
            request = request.middlewareOptions(prepScopes(...this.scopes));
          }

          response = await request.post({ requests: [requestOptions] });

          if (this.fetchThumbnail) {
            const thumbnailBatch = graph.createBatch();
            const thumbnailBatchBeta = BetaGraph.fromGraph(graph).createBatch();

            for (let i = 0; i < response.value[0].hitsContainers[0].hits.length; i++) {
              const element = response.value[0].hitsContainers[0].hits[i];
              if (
                (element.resource.size > 0 || element.resource.webUrl?.endsWith('.aspx')) &&
                (element.resource['@odata.type'] == '#microsoft.graph.driveItem' ||
                  element.resource['@odata.type'] == '#microsoft.graph.listItem')
              ) {
                if (element.resource['@odata.type'] == '#microsoft.graph.listItem') {
                  thumbnailBatchBeta.get(
                    i.toString(),
                    `/sites/${element.resource.parentReference.siteId}/pages/${element.resource.id}`
                  );
                } else {
                  thumbnailBatch.get(
                    i.toString(),
                    `/drives/${element.resource.parentReference.driveId}/items/${element.resource.id}/thumbnails/0/medium`
                  );
                }
              }
            }

            /**
             * Based on the batch response, augment the search result resource with the thumbnail url
             * @param thumbnailResponse
             */
            const augmentResponse = (thumbnailResponse: Map<string, BatchResponse>) => {
              if (thumbnailResponse && thumbnailResponse.size > 0) {
                for (const [key, value] of thumbnailResponse) {
                  let result = response.value[0].hitsContainers[0].hits[key];
                  const thumbnail: Thumbnail =
                    result.resource['@odata.type'] == '#microsoft.graph.listItem'
                      ? { url: value.content.thumbnailWebUrl }
                      : { url: value.content.url };
                  result.resource.thumbnail = thumbnail;
                }
              }
            };

            try {
              augmentResponse(await thumbnailBatch.executeAll());
              augmentResponse(await thumbnailBatchBeta.executeAll());
            } catch {
              // no-op
            }
          }

          if (!equals(this.response, response)) {
            this.response = response;
          }

          if (this.shouldUpdateCache() && response) {
            cache = CacheService.getCache<CacheResponse>(schemas.search, schemas.search.stores.responses);
            cache.putValue(key, { response: JSON.stringify(response) });
          }
        }

        if (!equals(this.response, response)) {
          this.response = response;
        }
      } catch (e) {
        this.error = e;
      }

      if (this.response) {
        this.error = null;
      }
    } else {
      this.response = null;
    }
    this.isRefreshing = false;
    this.fireCustomEvent('dataChange', { response: this.response, error: this.error });
  }

  /**
   * Render the loading state.
   *
   * @protected
   * @returns
   * @memberof MgtSearchResults
   */
  protected renderLoading(): TemplateResult {
    return (
      this.renderTemplate('loading', null) ||
      html`
        ${[...Array(this.size)].map(() => {
          return html`
            <div class="search-result">
              <div class="search-result-grid">
                <div class="search-result-icon">
                  <fluent-skeleton style="width: 32px; height: 32px;" shape="rect" shimmer></fluent-skeleton>
                </div>
                <div class="searc-result-content">
                  <div class="search-result-name">
                    <fluent-skeleton style="border-radius: 4px; margin-top: 10px; height: 10px; width: 20%" shape="rect" shimmer></fluent-skeleton>
                  </div>
                  <div class="search-result-info">
                    <div class="search-result-author">
                      <fluent-skeleton style="width: 24px; height: 24px;" shape="circle" shimmer></fluent-skeleton>
                    </div>
                    <div class="search-result-date">
                      <fluent-skeleton style="border-radius: 4px; margin-top: 2%; margin-left: 5px; height: 10px; width: 200px" shape="rect" shimmer></fluent-skeleton>
                    </div>
                  </div>
                  <fluent-skeleton style="border-radius: 4px; margin-top: 10px; height: 10px;" shape="rect" shimmer></fluent-skeleton>
                  <fluent-skeleton style="border-radius: 4px; margin-top: 10px; height: 10px;" shape="rect" shimmer></fluent-skeleton>
                </div>
                ${
                  this.fetchThumbnail &&
                  html`
                    <div class="search-result-thumbnail">
                      <fluent-skeleton style="width: 126px; height: 72px;" shape="rect" shimmer></fluent-skeleton>
                    </div>
                  `
                }  
              </div>          
              <fluent-divider></fluent-divider>            
            </div>
          `;
        })}
       `
    );
  }

  /**
   * Render the result item.
   *
   * @protected
   * @returns
   * @memberof MgtSearchResults
   */
  protected renderResult(result: SearchHit): TemplateResult {
    const type = this.getResourceType(result.resource);
    if (this.hasTemplate(`result-${type}`)) {
      return this.renderTemplate(`result-${type}`, result, result.hitId);
    } else {
      switch (result.resource['@odata.type']) {
        case '#microsoft.graph.driveItem':
          return this.renderDriveItem(result);
        case '#microsoft.graph.site':
          return this.renderSite(result);
        case '#microsoft.graph.person':
          return this.renderPerson(result);
        case '#microsoft.graph.drive':
        case '#microsoft.graph.list':
          return this.renderList(result);
        case '#microsoft.graph.listItem':
          return this.renderListItem(result);
        case '#microsoft.graph.search.bookmark':
          return this.renderBookmark(result);
        default:
          return this.renderDefault(result);
      }
    }
  }

  /**
   * Renders the footer with pages if required
   * @param hitsContainer Search results
   * @returns
   */
  private renderFooter(hitsContainer: SearchHitsContainer): TemplateResult {
    if (this.pagingRequired(hitsContainer)) {
      const pages = this.getActivePages(hitsContainer.total);

      return html`
        <div class="search-results-pages">
          ${this.renderPreviousPage()}
          ${this.renderFirstPage(pages)}
          ${this.renderAllPages(pages)}                
          ${this.renderNextPage()}
        </div>
      `;
    }
  }

  /**
   * Validates if paging is required based on the provided results
   * @param hitsContainer
   * @returns
   */
  private pagingRequired(hitsContainer: SearchHitsContainer): boolean {
    return hitsContainer?.moreResultsAvailable || this.currentPage * this.size < hitsContainer?.total;
  }

  /**
   * Gets a list of active pages to render for paging purposes
   * @param totalResults Total number of results of the search query
   * @returns
   */
  private getActivePages(totalResults: number): any[] {
    const getFirstPage = () => {
      const medianPage = this.currentPage - Math.floor(this.pagingMax / 2) - 1;

      if (medianPage >= Math.floor(this.pagingMax / 2)) {
        return medianPage;
      } else {
        return 0;
      }
    };

    let pages = [];
    const firstPage = getFirstPage();

    if (firstPage + 1 > this.pagingMax - this.currentPage || this.pagingMax == this.currentPage) {
      for (
        let i = firstPage + 1;
        i < Math.ceil(totalResults / this.size) &&
        i < this.pagingMax + (this.currentPage - 1) &&
        pages.length < this.pagingMax - 2;
        ++i
      ) {
        pages.push({ number: i + 1 });
      }
    } else {
      for (let i = firstPage; i < this.pagingMax; ++i) {
        pages.push({ number: i + 1 });
      }
    }

    return pages;
  }

  /**
   * Renders all sequential pages buttons
   * @param pages
   * @returns
   */
  private renderAllPages(pages: any[]): TemplateResult {
    return html`
      ${pages.map(
        page =>
          html`
            <fluent-button 
              appearance="stealth" 
              class="${page.number === this.currentPage ? 'search-results-page-active' : 'search-results-page'}" 
              @click="${() => this.onPageClick(page.number)}">
                ${page.number}
            </fluent-button>`
      )}`;
  }

  /**
   * Renders the "First page" button
   * @param pages
   * @returns
   */
  private renderFirstPage(pages: any[]): TemplateResult {
    return html`
      ${
        pages.some(page => page.number === 1)
          ? nothing
          : html`<fluent-button appearance="stealth" class="search-results-page" @click="${
              this.onFirstPageClick
            }">1</fluent-button>
          ${
            this.currentPage - Math.floor(this.pagingMax / 2) > 0
              ? html`
              <fluent-button 
                id="page-back-dot" 
                appearance="stealth" 
                class="search-results-page" 
                title="${this.getDotButtonTitle()}" 
                @click="${() => this.onPageClick(this.currentPage - Math.ceil(this.pagingMax / 2))}"
              >
                ...
              </fluent-button>`
              : nothing
          }`
      }`;
  }

  /**
   * Constructs the "dot dot dot" button title
   * @returns
   */
  private getDotButtonTitle() {
    return `${strings.back} ${Math.ceil(this.pagingMax / 2)} ${strings.pages}`;
  }

  /**
   * Renders the "Previous page" button
   * @returns
   */
  private renderPreviousPage() {
    return this.currentPage > 1
      ? html`
          <fluent-button 
            appearance="stealth" 
            class="search-results-page" 
            title="Back" 
            @click="${this.onPageBackClick}">
              ${getSvg(SvgIcon.ChevronLeft)}
            </fluent-button>`
      : nothing;
  }

  /**
   * Renders the "Next page" button
   * @returns
   */
  private renderNextPage() {
    return !this.isLastPage()
      ? html`
          <fluent-button 
            appearance="stealth" 
            class="search-results-page" 
            title="Next" 
            @click="${this.onPageNextClick}">
              ${getSvg(SvgIcon.ChevronRight)}
            </fluent-button>`
      : nothing;
  }

  /**
   * Triggers a specific page click
   * @param pageNumber
   */
  private onPageClick(pageNumber: number) {
    this.currentPage = pageNumber;
    this.scrollToFirstResult();
  }

  /**
   * Triggers a first page click
   */
  private onFirstPageClick() {
    this.currentPage = 1;
    this.scrollToFirstResult();
  }

  /**
   * Triggers a previous page click
   * @param page
   */
  private onPageBackClick(page: any) {
    this.currentPage--;
    this.scrollToFirstResult();
  }

  /**
   * Triggers a next page click
   * @param page
   */
  private onPageNextClick(page: any) {
    this.currentPage++;
    this.scrollToFirstResult();
  }

  /**
   * Validates if the current page is the last page of the collection
   * @returns
   */
  private isLastPage() {
    return this.currentPage === Math.ceil(this.response.value[0].hitsContainers[0].total / this.size);
  }

  /**
   * Scroll to the top of the search results
   */
  private scrollToFirstResult() {
    const target = this.renderRoot.querySelector('.search-results') as HTMLElement;
    target.scrollIntoView({
      block: 'start',
      behavior: 'smooth'
    });
  }

  /**
   * Gets the resource type (entity) of a search result
   * @param resource
   * @returns
   */
  private getResourceType(resource: any) {
    return resource['@odata.type'].split('.').pop();
  }

  /**
   * Renders a driveItem entity
   * @param result
   * @returns
   */
  private renderDriveItem(result: SearchHit): HTMLTemplateResult {
    let resource: any = result.resource as any;
    return mgtHtml`
      <div class="search-result-grid">
        <div class="search-result-icon">
          <mgt-file 
            .fileDetails="${result.resource}" 
            view="image" 
            class="file-icon">
          </mgt-file>
        </div>
        <div class="search-result-content">
          <div class="search-result-name">
            <a href="${resource.webUrl}?Web=1" target="_blank">${trimFileExtension(resource.name)}</a>
          </div>
          <div class="search-result-info">
            <div class="search-result-author">
              <mgt-person 
                person-query=${resource.lastModifiedBy.user.email} 
                view="oneLine"
                person-card="hover"
                show-presence="true">
              </mgt-person>
            </div>
            <div class="search-result-date">
              &nbsp; ${strings.modified} ${getRelativeDisplayDate(new Date(resource.lastModifiedDateTime))}
            </div>
          </div>
          <div class="search-result-summary" .innerHTML="${sanitizeSummary(result.summary)}"></div>
        </div>  
        ${
          resource.thumbnail?.url &&
          html`
          <div class="search-result-thumbnail">
            <a href="${resource.webUrl}" target="_blank"><img src="${resource.thumbnail?.url}" /></a>
          </div>`
        }
        
      </div>          
      <fluent-divider></fluent-divider>
    `;
  }

  /**
   * Renders a site entity
   * @param result
   * @returns
   */
  private renderSite(result: SearchHit): HTMLTemplateResult {
    let resource: any = result.resource as any;
    return html`
      <div class="search-result-grid">
        <div class="search-result-icon">
          <img src="${resource.webUrl}/_api/siteiconmanager/getsitelogo" />
        </div>
        <div class="searc-result-content">
          <div class="search-result-name">
            <a href="${resource.webUrl}" target="_blank">${resource.displayName}</a>
          </div>
          <div class="search-result-info">
            <div class="search-result-url">
              <a href="${resource.webUrl}" target="_blank">${resource.webUrl}</a>
            </div>
          </div>
          <div class="search-result-summary" .innerHTML="${sanitizeSummary(result.summary)}"></div>
        </div>  
      </div>          
      <fluent-divider></fluent-divider>
    `;
  }

  /**
   * Renders a list entity
   * @param result
   * @returns
   */
  private renderList(result: SearchHit): HTMLTemplateResult {
    let resource: any = result.resource as any;
    return mgtHtml`
      <div class="search-result-grid">
        <div class="search-result-icon">
          <mgt-file 
            .fileDetails="${result.resource}" 
            view="image">
          </mgt-file>
        </div>
        <div class="search-result-content">
          <div class="search-result-name">
            <a href="${resource.webUrl}?Web=1" target="_blank">
              ${trimFileExtension(resource.name || getNameFromUrl(resource.webUrl))}
            </a>
          </div>
          <div class="search-result-summary" .innerHTML="${sanitizeSummary(result.summary)}"></div>
        </div>  
      </div>          
      <fluent-divider></fluent-divider>
    `;
  }

  /**
   * Renders a listItem entity
   * @param result
   * @returns
   */
  private renderListItem(result: SearchHit): HTMLTemplateResult {
    let resource: any = result.resource as any;
    return mgtHtml`
      <div class="search-result-grid">
        <div class="search-result-icon">
          ${resource.webUrl.endsWith('.aspx') ? getSvg(SvgIcon.News) : getSvg(SvgIcon.File)}
        </div>
        <div class="search-result-content">
          <div class="search-result-name">
            <a href="${resource.webUrl}?Web=1" target="_blank">
              ${trimFileExtension(resource.name || getNameFromUrl(resource.webUrl))}
            </a>
          </div>
          <div class="search-result-info">
            <div class="search-result-author">
              <mgt-person 
                person-query=${resource.lastModifiedBy.user.email} 
                view="oneLine"
                person-card="hover"
                show-presence="true">
              </mgt-person>
            </div>
            <div class="search-result-date">
              &nbsp; ${strings.modified} ${getRelativeDisplayDate(new Date(resource.lastModifiedDateTime))}
            </div>
          </div>
          <div class="search-result-summary" .innerHTML="${sanitizeSummary(result.summary)}"></div>
        </div>        
        ${
          resource.thumbnail?.url &&
          html`       
          <div class="search-result-thumbnail">
            <a href="${resource.webUrl}" target="_blank"><img src="${resource.thumbnail?.url || nothing}" /></a>
          </div>`
        }
      </div>          
      <fluent-divider></fluent-divider>
    `;
  }

  /**
   * Renders a person entity
   * @param result
   * @returns
   */
  private renderPerson(result: SearchHit): HTMLTemplateResult {
    let resource: any = result.resource as any;
    return mgtHtml`
      <div class="search-result">
        <mgt-person 
          view="fourLines" 
          person-query=${resource.userPrincipalName} 
          person-card="hover"
          show-presence="true">
        </mgt-person> 
      </div>          
      <fluent-divider></fluent-divider>
    `;
  }

  /**
   * Renders a bookmark entity
   * @param result
   * @returns
   */
  private renderBookmark(result: SearchHit): HTMLTemplateResult {
    let resource: any = result.resource as any;
    return mgtHtml`
      <div class="search-result-grid search-result-bookmark">
        <div class="search-result-icon">
          ${getSvg(SvgIcon.DoubleBookmark)}
        </div>
        <div class="search-result-content">
          <div class="search-result-name">
            <a href="${resource.webUrl}?Web=1" target="_blank">${resource.displayName}</a>
          </div>
          <div class="search-result-summary">${resource.description}</div>
        </div>  
      </div>          
      <fluent-divider></fluent-divider>
    `;
  }

  /**
   * Renders any entity
   * @param result
   * @returns
   */
  private renderDefault(result: SearchHit): HTMLTemplateResult {
    let resource: any = result.resource as any;
    return mgtHtml`
      <div class="search-result-grid">
        <div class="search-result-icon">
          ${this.getResourceIcon(resource)}
        </div>
        <div class="search-result-content">
          <div class="search-result-name">
            <a href="${this.getResourceUrl(resource)}?Web=1" target="_blank">${this.getResourceName(resource)}</a>
          </div>
          <div class="search-result-summary" .innerHTML="${sanitizeSummary(result.summary)}"></div>
        </div>  
      </div>          
      <fluent-divider></fluent-divider>
    `;
  }

  /**
   * Gets default resource URLs
   * @param resource
   * @returns
   */
  private getResourceUrl(resource: any): string {
    return resource.webUrl || resource.url || resource.webLink || '#';
  }

  /**
   * Gets default resource Names
   * @param resource
   * @returns
   */
  private getResourceName(resource: any): string {
    return resource.displayName || resource.subject || trimFileExtension(resource.name);
  }

  /**
   * Gets default resource icon
   * @param resource
   * @returns
   */
  private getResourceIcon(resource: any) {
    switch (resource['@odata.type']) {
      case '#microsoft.graph.message':
        return getSvg(SvgIcon.Email);
      case '#microsoft.graph.event':
        return getSvg(SvgIcon.Event);
      default:
        return getSvg(SvgIcon.File);
    }
  }

  /**
   * Validates if cache should be retrieved
   * @returns
   */
  private shouldRetrieveCache(): boolean {
    return getIsResponseCacheEnabled() && this.cacheEnabled && !this.isRefreshing;
  }

  /**
   * Validates if cache should be updated
   * @returns
   */
  private shouldUpdateCache(): boolean {
    return getIsResponseCacheEnabled() && this.cacheEnabled;
  }

  /**
   * Builds the appropriate RequestOption for the search query
   * @returns
   */
  private getRequestOptions(): SearchRequest | BetaSearchRequest {
    var requestOptions: SearchRequest = {
      entityTypes: this.entityTypes as EntityType[],
      query: {
        queryString: this.queryString
      },
      from: this.from ? this.from : undefined,
      size: this.size ? this.size : undefined,
      fields: this.getFields(),
      enableTopResults: this.enableTopResults ? this.enableTopResults : undefined
    };

    if (this.entityTypes.includes('externalItem')) {
      requestOptions.contentSources = this.contentSources;
      /*requestOptions.resultTemplateOptions = {
        enableResultTemplate: true
      };*/
    }

    if (this.version === 'beta') {
      (requestOptions as BetaSearchRequest).query.queryTemplate = this.queryTemplate ? this.queryTemplate : undefined;
    }

    return requestOptions;
  }

  /**
   * Gets the fields and default fields for default render methods
   * @returns
   */
  private getFields(): string[] {
    if (this.fields) {
      return this.DEFAULT_FIELDS.concat(this.fields);
    }

    return undefined;
  }
}
