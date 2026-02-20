### Backend
#### Functionality / Flexibility
- [x] Add rocksdb backend for Surreal to persist data across restarts
- [ ] Make creations transactional so if the init template fails the database doesn't contain any uninitialized servers.
- [ ] Troubleshoot status updates for "Terminating" pods.
- [ ] Utilize the resource watching capabilities of kube for more realtime updates.
- [ ] Update application to accept configuration for default storage class, pod template name, port, etc.
- [ ] Complete the pod_template so that it uses resources etc.
- [x] Decompose the individual resources from init.yaml into separate templates.
- [ ] Decompose individual resources from pod_template.yaml into separate templates.
- [ ] Add support for a GLOBAL_INIT_TEMPLATE variable which can be used to apply deployment specific configuration (e.g. service mesh CRDs etc.)
- [ ] Support tera reloading?
- [ ] Update pod_template to make the gameserver container optional to support starting a container for SFTP only
- [ ] Implement editing a server.
- [ ] Implement connected user count
- [ ] Implement log streaming
#### Safety
- [ ] Add better sanitization for data sent to kubernetes
#### Optimizations
- [ ] Consider creating a background task for syncing certain data from kubernetes periodically (such as the pod name, service name, pvc name, connected player count (TBD)). 
    This could be a performance gain especially for fetching the connected user counts later on.
### Frontend
#### Functionality
- [ ] Update front end create server modal to display the remaining properties for the template and new game server request
    including resources and more. Maybe use separate tabs for the various settings since there is quite a lot.
- [ ] Add log streaming element so users can easily see logs.
#### Features
- [x] Add image to server tiles based on the `icon_url` property
- [ ] Add a button on server tile to allow starting in SFTP only mode. This allows setup and file copies to be done before
    first launch
- [ ] Add `default_max_players` to template.
