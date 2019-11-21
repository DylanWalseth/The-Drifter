import { Subject, Observable } from 'rxjs';

export class Events {
    public readonly CommandReceived = new Subject<string>();
}