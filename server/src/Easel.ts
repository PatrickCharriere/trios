import { Piece } from './Piece';

export class Easel {

    private _pieces: Piece[]
    private _userId: string

    constructor(pieces: Piece[], userId: string) {

        this._pieces = pieces
        this._userId = userId

    }

    get pieces(): Piece[] {

        return this._pieces
        
    }

    get userId(): string {

        return this._userId
        
    }

}