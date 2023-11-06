import WebSocket from 'ws';


type MessageHandler = (type: string, data: string) => void;

/**
 * - Establishes a connection to the client
 * - Sends and receives data from it
 */
export class WebClient {
    private messageHandler?: MessageHandler;

    private PORT: number = 31415;  // This is defined in code in the client as well, so waaaa

    private server: WebSocket.Server;
    private client: WebSocket | null = null;


    public constructor() {
        console.log("CLIENT: Trying to establish connection to client...")

        this.server = new WebSocket.Server({ port: this.PORT });

        this.server.on('connection', (client: WebSocket) => {
            if (this.validClient()) {
                return;
            }

            console.log("CLIENT: Established connection!")

            // You need to pass `handleClientMessage` like this. Otherwise you fuck up
            client.on('message', rawData => this.handleClientMessage(rawData));

            client.on('close', () => {
                console.log("CLIENT: Lost connection");
                this.client = null;
            });

            this.client = client;
        });

        this.server.on('error', () => { 
            console.log(`CLIENT: Unable to host a server on port ${this.PORT}`);
        });
    }

    /**
     * Sends info about the server to the client.
     * 
     * @param type - The type of data you're sending.
     * - ***The type has to be configured on the client side.***
     * @param data
     */
    public sendInfo(type: string, data: any) {
        const json = {
            type: type,
            data: data
        };

        const stringifiedJson = JSON.stringify(json);

        this.sendToClient(stringifiedJson);
    }

    /**
     * Sets the new message handler that is called whenever a new message is received
     * @param newMessageHandler The new message handler
     */
    public setMessageHandler(newMessageHandler: MessageHandler) {
        this.messageHandler = newMessageHandler;
    }


    private validClient(): boolean {
        return Boolean(this.client) && this.client!.readyState == WebSocket.OPEN;
    }

    private sendToClient(data: string) {
        if (!this.validClient()) {
            return;
        }

        this.client!.send(data);
    }

    private handleClientMessage(data: WebSocket.RawData) {
        const message = data.toString('utf8');
        const receivedJson: any = JSON.parse(message);

        console.log("CLIENT: Received JSON");
        if (!this.messageHandler) {
            console.log("WARNING: ClientHandler isn't set!")
            return
        }

        this.messageHandler(receivedJson.type, receivedJson.data);
    }
}
