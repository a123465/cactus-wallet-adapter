import {
    BaseMessageSignerWalletAdapter,
    pollUntilReady,
    WalletAccountError,
    WalletNotConnectedError,
    WalletNotFoundError,
    WalletNotInstalledError,
    WalletPublicKeyError,
    WalletSignTransactionError,
    EventEmitter
} from '@solana/wallet-adapter-base';
import { PublicKey, Transaction } from "@solana/web3.js";
import bs58 from 'bs58';

type SIGN_REQUEST = {
    signature: string;
    publicKey: string;
}

type SIGN_MESSAGE = {
    address: string;
    msg: string;
    sig: string;
}

type ResponseType = SIGN_REQUEST & SIGN_MESSAGE;

interface CactusWallet extends EventEmitter {
    isCactus?: boolean;
    signTransaction(transaction: Transaction): Promise<Transaction>;
    isConnected(): boolean;
    connect(): Promise<string[]>;
    disconnect(): Promise<void>;
    signMessage(message: string): Promise<{ signature: Uint8Array }>;
    request(param: { method: string; params: string | string[] | unknown }): Promise<ResponseType>;
}

interface CactusWindow extends Window {
    cactus?: {
        sol?: CactusWallet;
    };
}

declare const Window: CactusWindow;

export interface CactusWalletAdapterConfig {
    pollInterval?: number;
    pollCount?: number;
}

export interface CactusWalletAdapter extends BaseMessageSignerWalletAdapter {
    private _connecting: boolean;
    private _wallet: CactusWallet | null;
    private _publicKey: PublicKey | null;

    constructor(config: CactusWalletAdapterConfig = {}) {
        super();
        this._connecting = false;
        this._wallet = null;
        this._publicKey = null;

        if (!this.ready) pollUntilReady(this, config.pollInterval || 1000, config.pollCount || 3);
    }

    get publicKey(): PublicKey | null {
        return this._publicKey;
    }

    get ready(): boolean {
        return typeof window !== 'undefined' && !!window.cactus;
    }

    get connecting(): boolean {
        return this._connecting;
    }

    get conncted(): boolean {
        return !!this._wallet?.isConnected();
    } 

    async connect(): Promise <void> {
        try{
            if(this.connected || this.connecting) return;
            this._connecting = true;

            const wallet = typeof window !== 'undefined' && window.cactus?.sol;
            if(!wallet) throw new WalletNotFoundError();
            if(!wallet.isCactus) throw new WalletNotInstalledError();

            let account: string;
            try {
                [account] = await wallet.connect();
            } catch (error: any){
                throw new WalletAccountError(error?.message, error);
            }

            let publicKey: PublicKey;
            try {
                publicKey = new PublicKey(account);
            } cacth (error: any){
                throw new WalletPublicKeyError(error?.message, error);
            }

            this._wallet = wallet;
            this._publicKey = publicKey;
            
            this.emit('connect');
        } catch (error: any){
            this.emit('error', error);
            throw error;
        } finally {
            this._connecting = false;
        }
    }

    asyns disconnect(): Promise<void> {
        const wallet = this._wallet;
        if(wallet) {
            this._wallet = null;
            this._publicKey = null;

            await wallet.disconnect();
        }
    }

    async signTransaction(transaction: Transaction) Promise<Transaction> {
        try {
            const wallet = this._wallet;
            if(!wallet) throw new WalletNotConnectedError();
            try {
                const response = await wallet.request({method: 'sol_sign', params: [transaction] });

                const publicKey = new PublicKey(response.publicKey);
                const signature = bs58.decode(response.signature);

                transaction.addSignature(publicKey, signature);
                return transaction;
            } catch (error: any){
                throw new WalletSignTransactionError(error?.message, error);
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
        const signedTransactions: Transaction[] = [];

        for(const transaction of transactions) {
            const signedTransaction = await this.signTransaction(transaction)
            signedTransactions.push(signedTransaction);
            await this.sleep();
        }
        return signedTransactions;
    }

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
        try {
            const wallet = this._wallet;
            if(!wallet) throw new WalletNotConnectedError();

            try {
                //Pre process to text 
                const decodedMessage = new TextDecoder("utf-8").decode(message)
                const {sig: signature} = await wallet.requst({method: 'sol_sign',params: [decodedMessage]});

                return new TextEncoder().encode(signature)
            } catch (error: any){
                throw new WalletSignTransactionError(error?.message,error);
            }
        } cacth(error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    //Ultilities
    sleep(ms = 500): Promise<boolean>{
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}