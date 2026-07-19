### Backend
#### Functionality / Flexibility
- [ ] Add support for init containers.
- [x] ~~Add rocksdb backend for Surreal to persist data across restarts~~ (superseded by K8s-native storage)
- [ ] Make creations transactional so if any step fails no orphaned Kubernetes resources remain.
- [x] Troubleshoot status updates for "Terminating" pods.
- [x] Utilize the resource watching capabilities of kube for more realtime updates.
- [x] Update application to accept configuration for default storage class, service type, port, etc.
- [x] Refactor resource generation to support dynamic pod configuration (resources, env, command, mounts).
- [x] Decompose the individual resources from the old init.yaml into separate templates.
- [x] Decompose individual resources from the old pod_template.yaml into separate templates.
- [x] Support starting a container for SFTP only
- [x] Add support for sftp_user_id property
- [x] Implement editing a server.
- [ ] Implement connected user count
- [x] Implement log streaming
- [x] Add `default_max_players` to template.
#### Safety
- [x] Add better sanitization for data sent to kubernetes
- [x] Generate random password for sftp server
### Frontend
### Bugs
- [x] Fix resource slider / editing.
- [x] Fix toasts from create modal not showing up.
#### Functionality
- [x] Update front end create server modal to display the remaining properties for the template and new game server request
    including resources and more. Maybe use separate tabs for the various settings since there is quite a lot.
- [x] Add log streaming element so users can easily see logs.
#### Features
- [x] Add image to server tiles based on the `icon_url` property
- [x] Add a button on server tile to allow starting in SFTP only mode. This allows setup and file copies to be done before
    first launch
- [ ] Implement server commands (may not be supported for every server, and implementation may vary)
### Shared
- [x] Add ConfigMap-based storage for template repository settings (superseded the SurrealDB approach).
