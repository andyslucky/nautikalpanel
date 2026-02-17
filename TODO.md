### Backend
- [x] Add rocksdb backend for Surreal to persist data across restarts
- [ ] Update application to accept configuration for default storage class, pod template name, port, etc.
- [x] Decompose the individual resources from init.yaml into separate templates.
- [ ] Decompose individual resources from pod_template.yaml into separate templates.
- [ ] Create background task to reload the tera templates periodically.
- [ ] Update pod_template to make the gameserver container optional to support starting a container for SFTP only
- [ ] Implement editing a server.
- [ ] Add better sanitization for data sent to kubernetes
- [ ] Consider creating a background task for syncing certain data from kubernetes periodically (such as the pod name, service name, pvc name, connected player count (TBD)). 
    This could be a performance gain especially for fetching the connected user counts later on.
- [ ] Implement connected user count
- [ ] Implement log streaming
### Frontend
- [ ] Update front end create server modal to display the remaining properties for the template and new game server request
    including resources and more. Maybe use separate tabs for the various settings since there is quite a lot.
- [ ] Add image to server tiles based on the `icon_url` property
- [ ] Add `default_max_players` to template.
- [ ] Add a button on server tile to allow starting in SFTP only mode. This allows setup and file copies to be done before
    first launch
- [ ] Add log streaming element so users can easily see logs.
