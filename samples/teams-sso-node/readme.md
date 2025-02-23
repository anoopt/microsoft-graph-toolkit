# Node.js Server for Microsoft Teams Single Sign On (SSO)
This sample is a reference implementation of a backend service that can be used with the [Teams Msal2 Provider](https://learn.microsoft.com/graph/toolkit/providers/teams-msal2) for a single sign on experience. 

This sample implements both a `GET` and `POST` api for exchanging the Microsoft Teams authentication token with a token that can be used to call Microsoft Graph. It uses the [on-behalf-of flow](https://learn.microsoft.com/azure/active-directory/develop/v2-oauth2-on-behalf-of-flow) to exchange the tokens.

## Prerequisites

You will need:

1. A global administrator account for an Office 365 tenant. Testing in a production tenant is not recommended! You can get a free tenant for development use by signing up for the [Office 365 Developer Program](https://developer.microsoft.com/microsoft-365/dev-program).

1. To test locally, [NodeJS](https://nodejs.org/en/download/) must be installed on your development machine.

1. To test locally, you will need to tunnel requests from the internet to your local computer. You can use [ngrok](https://ngrok.com/) for this.

    > NOTE: The free ngrok plan will generate a new URL every time you run it, which requires you to update your Azure AD registration, the Teams app manifest, and the project configuration. A paid account with a permanent ngrok URL is recommended.

## Running the sample

1. Clone and build the repo

    ```bash
    > git clone https://github.com/microsoftgraph/microsoft-graph-toolkit
    > cd microsoft-graph-toolkit
    > yarn
    > yarn build
    ``` 

1. Open `index.html` in the root of the repo and 
    - Comment out the `mgt-mock-provider`
    - Comment out the `mgt-login` component
    - Uncomment the `mgt-teams-msal2-provider` used for sso
    - Update the `client-id` used in the provider with your own (see below for creating the AAD registration)


1. Start the client from the root of the repo

    ```bash
    > yarn start
    ```

1. Open a new terminal and navigate to the server directory (this sample) and install dependencies

    ```bash
    > cd samples/teams-sso-node
    > yarn
    ```

1. Copy `example.env` to `.env` and populate with client id and app secret (see below for creating the AAD registration)

1. Start the server

    ```bash
    > yarn start
    ```

1. Open a new terminal and run the application to expose your local web server via a public URL. If you're using ngrok, you can do:

    ```bash
    > ngrok http 3000
    ```

    If you have a paid ngrok account, you can use your own subdomain instead of a random URL

    ```bash
    > ngrok http 3000 -subdomain=example
    ```

1. Create a Teams app and load it in Microsoft Teams (see creating a Teams app section below)

##  Creating the AAD registration
Your tab needs to run as a registered Azure AD application to obtain an access token from Azure AD. In this step, you'll register the app in your tenant and give Microsoft Teams permission to obtain access tokens on its behalf.

1. Open a browser and navigate to the [Azure Active Directory admin center](https://aad.portal.azure.com). Log in using a **personal account** (aka: Microsoft Account) or **Work or School Account**.

1. Select **Azure Active Directory** in the left-hand navigation, then select **App registrations** under **Manage**.

1. Select **New registration**. On the **Register an application** page, set the values as follows.

    - Set **Name** to `Node.js Teams SSO` (or a name of your choice).
    - Set **Supported account types** to **Accounts in any organizational directory and personal Microsoft accounts**.
    - Under **Redirect URI**, set the first drop-down to `Single Page Application` and set the value to the application's public url + `/auth.html`. Ex: `https://mgtsso.example.com/auth.html`. 

1. From the app overview page, copy the value of the **Application (client) ID** for later. You will need it for the following steps. You will use this value in the `index.html` and `.env` files

1. Navigate to **Certificates & secrets** under **Manage**. Select the **New client secret** button. Enter a value in **Description** and select one of the options for **Expires** and select **Add**.

1. Copy the client secret value before you leave this page. You will use this value in the `.env` file of the server.

    > **IMPORTANT**
    > This client secret is never shown again, so make sure you copy it now.

1. Navigate to **API permissions** under **Manage**. Select **Add a permission** > **Microsoft Graph** > **Delegated permissions**, then add the following permissions   
    - `email`, `offline_access`, `openid`, `profile`, `User.Read`
    - Select **Add permissions** when done

1. (OPTIONAL) If you want to pre-consent the scopes that the Microsoft Graph Toolkit components used in this sample, add the following permissions: 
    - `user.read.all, mail.readBasic, people.read.all, sites.read.all, user.readbasic.all, contacts.read, presence.read, presence.read.all, tasks.readwrite, tasks.read`
    
    - If you use different components or plan to use other Microsoft Graph APIs, you may require additional permissions. See the [documentation](https://learn.microsoft.com/graph/toolkit/overview) for each component for details on required permissions.

    - To pre-consent as an admin, select **Grant admin consent**, then select **Yes**

1. Navigate to **Expose an API** under **Manage**. On the top of the page next to `Application ID URI` select **Set**. This generates an API in the form of: `api://{AppID}`. Update it to add your subdomain, ex: `api://mgtsso.example.com/{appID}`

1. On the same page, select **Add a scope**. Fill in the fields as follows and select **Add scope**.

    - Scope name: `access_as_user`
    - Who can consent?: **Admins and users**
    - Admin consent display name: `Teams can access the user’s profile`
    - Admin consent description: `Allows Teams to call the app’s web APIs as the current user`
    - User consent display name: `Teams can access the user profile and make requests on the user's behalf`
    - User consent description: `Enable Teams to call this app’s APIs with the same rights as the user.`
    - State: **Enabled**
    
    Your API URL should look like this: `api://mgtsso.example.com/{appID}/access_as_user`. 

1. Next, add two client applications. This is for the Teams desktop/mobile clients and the web client. Under the **Authorized client applications** section, select **Add a client application**. Fill in the Client ID and select the scope we created. Then select **Add application**. Do this for the followings Ids
    
    - 5e3ce6c0-2b1f-4285-8d4b-75ee78787346
    - 1fec8e78-bce4-4aaf-ab1b-5451cc387264
## Creating a Teams App

Now you can use the [Developer Portal for Teams](https://learn.microsoft.com/microsoftteams/platform/concepts/build-and-test/teams-developer-portal) to configure, distribute and manage your application. You can access the [Developer Portal for Teams in a web browser](https://dev.teams.microsoft.com/) or as a [Teams App](https://teams.microsoft.com/l/app/14072831-8a2a-4f76-9294-057bf0b42a68).

You can also use the [Teams Toolkit](https://marketplace.visualstudio.com/items?itemName=TeamsDevApp.ms-teams-vscode-extension) in **Visual Studio Code** to quickly create and deploy your Teams app.

To use the Developer Portal for Teams:

1. Open [Developer Portal for Teams](https://dev.teams.microsoft.com/).

2. Choose **Apps** from the left sidebar menu.

3. Click on **+ New app** from the options at the top left of the screen. This will open a modal where you enter an application name. Click **Add** to save it.

4. Fill in the remaining required basic information of the application. Required fields have an asterik (*) after their titles.
    > **Note**: The application ID is automatically created for you when you add the new application.

    a. For **App names**, the short name will be the name you entered before for your application.

    b. For **Descriptions**, fill the **Short description** and **Long description**.

    c. For **Developer**, fill a **Developer of company name**. Set the the application URL as the **Website**.

    d. For **App urls**, use `https://mgtsso.example.com/privacy` for **Privacy policy** and `https://mgtsso.example.com/terms` for **Terms of use**.

    e. For **Application (client) ID**, fill in the client ID you got when you registered in AAD.

    f. Click **Save**.

5. Click on **App features** under **Configure** to specify the features you want to include for your application. Select **Personal app** feature. Fill the name of the app in the **Name** section and the application URL in the **Content URL** section. Select the **Context** as **personalTab**. Click **Confirm** to save.
    > **Note**: This is the tab that will appear on the application when it is launched.

6. Click **Single sign-on** under **Configure**. Enter the API URL you set during the AAD App registration process. Click **Save**.
    > Example: `api://mgtsso.example.com/{Your App Id}`

7. In the top right, click on the **Preview in Teams** button. Your application will be opened in Teams. Test it out.

8. Click on **Publish** to distribute it.

### How do I know it worked?

If everything worked correctly, the components should load data just as they would normally after login.