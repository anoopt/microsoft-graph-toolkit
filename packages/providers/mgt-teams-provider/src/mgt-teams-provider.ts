/**
 * -------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation.  All Rights Reserved.  Licensed under the MIT License.
 * See License in the project root for license information.
 * -------------------------------------------------------------------------------------------
 */

import { customElement, property } from 'lit/decorators.js';
import { Configuration } from 'msal';
import { Providers, MgtBaseProvider, GraphEndpoint, validateBaseURL } from '@microsoft/mgt-element';
import { TeamsConfig, TeamsProvider } from './TeamsProvider';

/**
 * Authentication Library Provider for Microsoft Teams accounts
 *
 * @export
 * @class MgtTeamsProvider
 * @extends {MgtBaseProvider}
 */
@customElement('mgt-teams-provider')
export class MgtTeamsProvider extends MgtBaseProvider {
  /**
   * String alphanumerical value relation to a specific user
   *
   * @memberof MgtTeamsProvider
   */
  @property({
    attribute: 'client-id',
    type: String
  })
  public clientId = '';

  /**
   * The relative or absolute path of the html page that will handle the authentication
   *
   * @memberof MgtTeamsProvider
   */
  @property({
    attribute: 'auth-popup-url',
    type: String
  })
  public authPopupUrl = '';

  /**
   * The authority to use.
   *
   * @memberof MgtTeamsProvider
   */
  @property() public authority;

  /**
   * Comma separated list of scopes.
   *
   * @memberof MgtTeamsProvider
   */
  @property({
    attribute: 'scopes',
    type: String
  })
  public scopes;
  /**
   * Gets whether this provider can be used in this environment
   *
   * @readonly
   * @memberof MgtTeamsProvider
   */

  /**
   * The base URL that should be used in the graph client config.
   *
   * @memberof MgtMsal2Provider
   */
  @property({
    attribute: 'base-url',
    type: String
  })
  public baseUrl: GraphEndpoint;

  public get isAvailable() {
    return TeamsProvider.isAvailable;
  }
  /**
   * method called to initialize the provider. Each derived class should provide their own implementation
   *
   * @protected
   * @memberof MgtTeamsProvider
   */
  protected initializeProvider() {
    if (this.clientId && this.authPopupUrl) {
      const config: TeamsConfig = {
        authPopupUrl: this.authPopupUrl,
        clientId: this.clientId
      };

      if (this.scopes) {
        const scope = this.scopes.split(',');
        if (scope && scope.length > 0) {
          config.scopes = scope;
        }
      }

      if (this.authority) {
        const msalConfig: Configuration = {
          auth: {
            authority: this.authority,
            clientId: this.clientId
          }
        };
        config.msalOptions = msalConfig;
      }

      if (this.baseUrl) {
        const validURL = validateBaseURL(this.baseUrl);
        if (validURL) {
          config.baseURL = validURL;
        }
      }

      this.provider = new TeamsProvider(config);
      Providers.globalProvider = this.provider;
    }
  }
}
