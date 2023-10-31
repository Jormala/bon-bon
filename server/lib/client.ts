import WebSocket from 'ws';


/**
 * - Establishes a connection to the client
 * - Sends and receives data from it
 */

export class Client {
    // this is really stupid. WAAYY too accessible
    public messageHandler: (((data: any) => void) | undefined);

    private CLIENT_PORT: number = 3001;  // This is defined in code in the client as well, so waaaa

    private client: WebSocket;


    public constructor() {
        this.client = new WebSocket(`ws://localhost:${this.CLIENT_PORT}`);

        console.log('CLIENT: Trying to establish connection to client...')

        this.client.on('message', this.handleClientMessage);

        this.client.on('open', () => {
            console.log('CLIENT: Established connection!')
        });

        this.client.on('close', () => {
            console.log('CLIENT: Lost connection')
        });
    }

    /**
     * Sends info about the server to the client.
     * 
     * @param type - The type of data you're sending.
     * 
     * - ***The type has to be configured on the client side.***
     * 
     * @param data
     */
    public sendInfo(type: string, data: string) {
        const json = {
            type: type,
            data: data
        };

        const stringifiedJson = JSON.stringify(json);

        this.sendToClient(stringifiedJson);
    }

    private clientOpen(): boolean {
        return this.client.readyState === WebSocket.OPEN;
    }

    private sendToClient(data: string) {
        if (!this.clientOpen()) {
            return
        }

        this.client.send(data);
    }

    private handleClientMessage(data: WebSocket.RawData) {
        const message = data.toString('utf8');

        const receivedJson: any = JSON.parse(message);

        console.log("CLIENT: Received JSON");

        if (!this.messageHandler) {
            console.log("WARNING: ClientHandler isn't set!")
            return
        }

        this.messageHandler(receivedJson);
    }
}
